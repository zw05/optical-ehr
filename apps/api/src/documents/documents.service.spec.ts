import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DocumentKind, DocumentReviewStatus, EncounterStatus, Role } from '@prisma/client';
import { DocumentsService } from './documents.service';
import { JwtPayload } from '../auth/auth.service';

const doctor: JwtPayload = { sub: 'doc-1', practiceId: 'pr-1', role: Role.DOCTOR, email: 'd@x' };
const technician: JwtPayload = { sub: 'tech-1', practiceId: 'pr-1', role: Role.TECHNICIAN, email: 't@x' };
const optician: JwtPayload = { sub: 'opt-1', practiceId: 'pr-1', role: Role.OPTICIAN, email: 'o@x' };

const storedDoc = {
  id: 'doc-a',
  patientId: 'pat-1',
  blobPath: '2026-08-16/uuid-scan.pdf',
  reviewStatus: DocumentReviewStatus.PENDING_REVIEW,
};

const draftEncounter = { id: 'enc-1', patientId: 'pat-1', status: EncounterStatus.IN_PROGRESS };

function makeService(overrides: Record<string, Partial<Record<string, jest.Mock>>> = {}) {
  const prisma = {
    patient: { findFirst: jest.fn().mockResolvedValue({ id: 'pat-1' }), ...overrides.patient },
    document: {
      create: jest.fn().mockResolvedValue({ id: 'doc-a' }),
      findFirst: jest.fn().mockResolvedValue(storedDoc),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ id: 'doc-a' }),
      ...overrides.document,
    },
    encounter: { findFirst: jest.fn().mockResolvedValue(draftEncounter), ...overrides.encounter },
    encounterDocument: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'link-1' }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      ...overrides.encounterDocument,
    },
  };
  const blobs = {
    upload: jest.fn().mockResolvedValue({ blobPath: 'p', sha256: 'h', sizeBytes: 4 }),
    download: jest.fn().mockResolvedValue(Buffer.from('pdf')),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new DocumentsService(prisma as never, blobs as never, audit as never);
  return { service, prisma, blobs, audit };
}

const uploadArgs = {
  practiceId: 'pr-1',
  patientId: 'pat-1',
  uploadedById: 'tech-1',
  fileName: 'outside-rx.pdf',
  contentType: 'application/pdf',
  dataBase64: '',
  data: Buffer.from('scan'),
};

describe('DocumentsService', () => {
  describe('upload', () => {
    it('stores the file and links it to the encounter when one is given', async () => {
      const { service, prisma, blobs } = makeService();
      await service.upload({ ...uploadArgs, kind: DocumentKind.EXTERNAL_RX, encounterId: 'enc-1' });
      expect(blobs.upload).toHaveBeenCalled();
      expect(prisma.document.create.mock.calls[0][0].data.encounterLinks).toEqual({
        create: { encounterId: 'enc-1', linkedById: 'tech-1' },
      });
    });

    it('validates the encounter link before writing bytes it would have to orphan', async () => {
      const { service, prisma, blobs } = makeService({
        encounter: { findFirst: jest.fn().mockResolvedValue(null) },
      });
      await expect(
        service.upload({ ...uploadArgs, encounterId: 'enc-gone' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(blobs.upload).not.toHaveBeenCalled();
      expect(prisma.document.create).not.toHaveBeenCalled();
    });

    it('rejects out-of-range transcribed values', async () => {
      const { service } = makeService();
      await expect(
        service.upload({
          ...uploadArgs,
          kind: DocumentKind.EXTERNAL_RX,
          extractedData: { od: { sphere: -2, axis: 200 } },
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('accepts keratometry readings in millimetres', async () => {
      const { service, prisma } = makeService();
      await service.upload({
        ...uploadArgs,
        kind: DocumentKind.KERATOMETRY,
        extractedData: { kUnit: 'mm', od: { k1: 7.8, k2: 7.6, kAxis: 180 }, os: { k1: 7.85 } },
      });
      expect(prisma.document.create).toHaveBeenCalled();
    });
  });

  describe('list', () => {
    const rxRow = {
      id: 'doc-a',
      fileName: 'outside-rx.pdf',
      extractedData: { od: { sphere: -1.25 } },
      encounterLinks: [{ encounterId: 'enc-1' }],
    };

    it('gives clinical staff the transcribed values and the linked exams', async () => {
      const { service } = makeService({
        document: { findMany: jest.fn().mockResolvedValue([rxRow]) },
      });
      const [doc] = await service.list('pr-1', 'pat-1', technician);
      expect(doc.extractedData).toEqual({ od: { sphere: -1.25 } });
      expect(doc.linkedEncounterIds).toEqual(['enc-1']);
    });

    it('withholds transcribed values from front desk and opticians', async () => {
      const { service } = makeService({
        document: { findMany: jest.fn().mockResolvedValue([rxRow]) },
      });
      const [doc] = await service.list('pr-1', 'pat-1', optician);
      expect(doc.extractedData).toBeUndefined();
      expect(doc.fileName).toBe('outside-rx.pdf');
    });
  });

  describe('link', () => {
    it('refuses to staple one patient’s record into another patient’s exam', async () => {
      const { service } = makeService({
        encounter: {
          findFirst: jest.fn().mockResolvedValue({ ...draftEncounter, patientId: 'pat-2' }),
        },
      });
      await expect(service.link('pr-1', 'doc-a', 'enc-1', doctor)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuses to attach to a signed encounter', async () => {
      const { service } = makeService({
        encounter: {
          findFirst: jest.fn().mockResolvedValue({ ...draftEncounter, status: EncounterStatus.SIGNED }),
        },
      });
      await expect(service.link('pr-1', 'doc-a', 'enc-1', doctor)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('is idempotent when the document is already attached', async () => {
      const { service, prisma } = makeService({
        encounterDocument: { findUnique: jest.fn().mockResolvedValue({ id: 'link-existing' }) },
      });
      const link = await service.link('pr-1', 'doc-a', 'enc-1', doctor);
      expect(link).toEqual({ id: 'link-existing' });
      expect(prisma.encounterDocument.create).not.toHaveBeenCalled();
    });

    it('writes a patient-scoped audit row so chart access reports catch it', async () => {
      const { service, audit } = makeService();
      await service.link('pr-1', 'doc-a', 'enc-1', doctor);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ patientId: 'pat-1' }));
    });
  });

  describe('unlink', () => {
    it('404s when the document was not attached to that encounter', async () => {
      const { service } = makeService({
        encounterDocument: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
      });
      await expect(service.unlink('pr-1', 'doc-a', 'enc-1', doctor)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('leaves the stored file alone', async () => {
      const { service, blobs } = makeService();
      await service.unlink('pr-1', 'doc-a', 'enc-1', doctor);
      expect(blobs.download).not.toHaveBeenCalled();
    });
  });

  describe('review', () => {
    it('rejects non-clinical staff', async () => {
      const { service } = makeService();
      await expect(
        service.review('pr-1', 'doc-a', optician, DocumentReviewStatus.REVIEWED),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('stamps the reviewer and audits the attestation', async () => {
      const { service, prisma, audit } = makeService();
      await service.review('pr-1', 'doc-a', technician, DocumentReviewStatus.REVIEWED);
      const data = prisma.document.update.mock.calls[0][0].data;
      expect(data.reviewStatus).toBe(DocumentReviewStatus.REVIEWED);
      expect(data.reviewedById).toBe('tech-1');
      expect(data.reviewedAt).toBeInstanceOf(Date);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ detail: 'Document review: REVIEWED' }),
      );
    });
  });

  describe('update', () => {
    it('drops an already-reviewed document back to pending when values change', async () => {
      const { service, prisma } = makeService({
        document: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ ...storedDoc, reviewStatus: DocumentReviewStatus.REVIEWED }),
        },
      });
      await service.update('pr-1', 'doc-a', { extractedData: { od: { sphere: -1.25 } } });
      const data = prisma.document.update.mock.calls[0][0].data;
      expect(data.reviewStatus).toBe(DocumentReviewStatus.PENDING_REVIEW);
      expect(data.reviewedById).toBeNull();
      expect(data.reviewedAt).toBeNull();
    });

    it('keeps the review when only the classification changes', async () => {
      const { service, prisma } = makeService({
        document: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ ...storedDoc, reviewStatus: DocumentReviewStatus.REVIEWED }),
        },
      });
      await service.update('pr-1', 'doc-a', { kind: DocumentKind.REFERRAL_LETTER });
      const data = prisma.document.update.mock.calls[0][0].data;
      expect(data.reviewStatus).toBeUndefined();
    });
  });
});
