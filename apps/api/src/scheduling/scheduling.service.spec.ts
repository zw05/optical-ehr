import { ForbiddenException } from '@nestjs/common';
import { AppointmentStatus, Role } from '@prisma/client';
import { SchedulingService } from './scheduling.service';

const appointment = { id: 'appt-1', practiceId: 'pr-1', patientId: 'pat-1' };

function makeService() {
  const prisma = {
    appointment: {
      findFirst: jest.fn().mockResolvedValue(appointment),
      update: jest
        .fn()
        .mockImplementation(({ data }) => Promise.resolve({ ...appointment, ...data })),
    },
    encounter: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
    examTemplate: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const service = new SchedulingService(prisma as never);
  return { service, prisma };
}

describe('SchedulingService.setStatus', () => {
  it('lets reception check a patient in', async () => {
    const { service, prisma } = makeService();
    const updated = await service.setStatus(
      'pr-1',
      'appt-1',
      { status: AppointmentStatus.CHECKED_IN },
      Role.RECEPTIONIST,
    );
    expect(updated.status).toBe(AppointmentStatus.CHECKED_IN);
    expect(prisma.appointment.update).toHaveBeenCalled();
  });

  it.each([AppointmentStatus.IN_PROGRESS, AppointmentStatus.COMPLETED])(
    'stops reception from setting %s',
    async (status) => {
      const { service, prisma } = makeService();
      await expect(
        service.setStatus('pr-1', 'appt-1', { status }, Role.RECEPTIONIST),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.appointment.update).not.toHaveBeenCalled();
    },
  );

  it.each([Role.TECHNICIAN, Role.DOCTOR, Role.ADMIN])('lets %s complete the exam', async (role) => {
    const { service } = makeService();
    const updated = await service.setStatus(
      'pr-1',
      'appt-1',
      { status: AppointmentStatus.COMPLETED },
      role,
    );
    expect(updated.status).toBe(AppointmentStatus.COMPLETED);
  });
});
