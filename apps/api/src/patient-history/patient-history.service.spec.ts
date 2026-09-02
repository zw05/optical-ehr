import { NotFoundException } from '@nestjs/common';
import { PatientHistoryService } from './patient-history.service';

function makeService() {
  const prisma = {
    patient: { findFirst: jest.fn().mockResolvedValue({ id: 'pat-1' }) },
    patientIntakeHistory: {
      findUnique: jest.fn(),
      upsert: jest.fn().mockResolvedValue({ id: 'intake-1' }),
    },
    patientHistoryReview: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'rev-1', ...data })),
    },
  };
  const service = new PatientHistoryService(prisma as never);
  return { service, prisma };
}

describe('PatientHistoryService.get', () => {
  it('rejects a chart from another practice', async () => {
    const { service, prisma } = makeService();
    prisma.patient.findFirst.mockResolvedValue(null);
    await expect(service.get('pr-2', 'pat-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns an empty questionnaire before the patient has filled one in', async () => {
    const { service, prisma } = makeService();
    prisma.patientIntakeHistory.findUnique.mockResolvedValue(null);
    const result = await service.get('pr-1', 'pat-1');
    expect(result.answers).toEqual({});
    expect(result.reviews).toEqual([]);
  });
});

describe('PatientHistoryService.update', () => {
  async function saved(answers: Record<string, unknown>) {
    const { service, prisma } = makeService();
    await service.update('pr-1', 'pat-1', { answers } as never);
    return prisma.patientIntakeHistory.upsert.mock.calls[0][0].create.answers;
  }

  it('keeps catalog answers with their follow-up detail', async () => {
    expect(
      await saved({ 'family.glaucoma': { status: 'yes', detail: 'Mother' } }),
    ).toEqual({ 'family.glaucoma': { status: 'yes', detail: 'Mother' } });
  });

  it('keeps the finer answers used where the clinic records more than yes/no', async () => {
    expect(await saved({ 'social.tobacco': { status: 'former' } })).toEqual({
      'social.tobacco': { status: 'former' },
    });
  });

  it('drops answers whose status is not a catalog slug', async () => {
    expect(
      await saved({
        'pmh.asthma': { status: 'DROP TABLE' },
        'pmh.arthritis': { status: 'no' },
      }),
    ).toEqual({ 'pmh.arthritis': { status: 'no' } });
  });

  it('omits rows that carry neither an answer nor a note', async () => {
    expect(await saved({ 'ros.skin': { status: '' }, 'ros.ent': { status: 'no' } })).toEqual({
      'ros.ent': { status: 'no' },
    });
  });

  it('keeps a free-text row that has detail but no answer', async () => {
    expect(await saved({ 'text.pastSurgicalHistory': { status: '', detail: 'LASIK 2019' } })).toEqual(
      { 'text.pastSurgicalHistory': { status: '', detail: 'LASIK 2019' } },
    );
  });

  it('truncates an over-long detail rather than rejecting the save', async () => {
    const answers = await saved({ 'pmh.others': { status: 'yes', detail: 'x'.repeat(900) } });
    expect((answers as Record<string, { detail: string }>)['pmh.others'].detail).toHaveLength(500);
  });
});

describe('PatientHistoryService.addReview', () => {
  it('records the reviewing provider and the visit it happened at', async () => {
    const { service, prisma } = makeService();
    const review = await service.addReview('pr-1', 'pat-1', 'doc-1', {
      changesNoted: true,
      encounterId: 'enc-1',
    });
    expect(prisma.patientIntakeHistory.upsert).toHaveBeenCalled();
    expect(review).toMatchObject({
      intakeId: 'intake-1',
      reviewedById: 'doc-1',
      encounterId: 'enc-1',
      changesNoted: true,
    });
  });

  it('defaults to "no changes" when the provider just confirms the chart', async () => {
    const { service } = makeService();
    const review = await service.addReview('pr-1', 'pat-1', 'doc-1', {});
    expect(review).toMatchObject({ changesNoted: false });
  });
});
