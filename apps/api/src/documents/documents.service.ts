import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import {
  DocumentKind,
  DocumentReviewStatus,
  EncounterStatus,
  Prisma,
  Role,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { BlobStorageService } from './blob-storage.service';
import { JwtPayload } from '../auth/auth.service';
import {
  ExtractedDataDto,
  ListDocumentsDto,
  UpdateDocumentDto,
  UploadDocumentDto,
} from './documents.dto';

/** Metadata columns returned to list views; never includes the file bytes. */
const LIST_FIELDS = {
  id: true,
  fileName: true,
  contentType: true,
  category: true,
  kind: true,
  externalProvider: true,
  documentDate: true,
  extractedData: true,
  reviewStatus: true,
  reviewedAt: true,
  sizeBytes: true,
  createdAt: true,
} satisfies Prisma.DocumentSelect;

/**
 * Patient file attachments: insurance card scans, outside records, imported
 * paper prescriptions and keratometry printouts. Bytes live in blob storage;
 * PostgreSQL keeps the metadata, hash, and any values transcribed off the page.
 *
 * Documents belong to the chart, not to a single visit — EncounterDocument
 * links one document to every exam it is relevant to, so a scanned outside Rx
 * is uploaded once and referenced across visits.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blobs: BlobStorageService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Stores the file bytes and creates the Document metadata row. When
   * `encounterId` is supplied the document is linked to that exam in the same
   * transaction, which is the common case for a scan made during a visit.
   */
  async upload(params: UploadDocumentDto & { practiceId: string; uploadedById: string; data: Buffer }) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: params.patientId, practiceId: params.practiceId },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');

    if (params.extractedData) this.validateExtractedData(params.extractedData);
    // Validate the link target before writing bytes we would have to orphan.
    if (params.encounterId) {
      await this.getLinkableEncounter(params.practiceId, params.encounterId, params.patientId);
    }

    const stored = await this.blobs.upload('documents', params.fileName, params.data);
    return this.prisma.document.create({
      data: {
        patientId: params.patientId,
        fileName: params.fileName,
        contentType: params.contentType,
        blobPath: stored.blobPath,
        sha256: stored.sha256,
        sizeBytes: stored.sizeBytes,
        category: params.category,
        kind: params.kind ?? DocumentKind.OTHER,
        externalProvider: params.externalProvider,
        documentDate: params.documentDate ? new Date(params.documentDate) : undefined,
        extractedData: (params.extractedData ?? undefined) as Prisma.InputJsonValue | undefined,
        uploadedById: params.uploadedById,
        encounterLinks: params.encounterId
          ? { create: { encounterId: params.encounterId, linkedById: params.uploadedById } }
          : undefined,
      },
    });
  }

  /**
   * Metadata-only listing for the chart's documents tab (no file bytes).
   * `linkedEncounterIds` lets the exam UI show which documents are already
   * pulled into a visit without a second round trip.
   *
   * The chart list is open to front desk and opticians (they file insurance
   * cards here), so transcribed clinical values are withheld from them — the
   * file itself stays reachable, its refraction/K readings do not.
   */
  async list(practiceId: string, patientId: string, user: JwtPayload, filter: ListDocumentsDto = {}) {
    const docs = await this.prisma.document.findMany({
      where: { patientId, patient: { practiceId }, kind: filter.kind },
      orderBy: { createdAt: 'desc' },
      select: { ...LIST_FIELDS, encounterLinks: { select: { encounterId: true } } },
    });
    const clinical = isClinical(user);
    return docs.map(({ encounterLinks, extractedData, ...doc }) => ({
      ...doc,
      extractedData: clinical ? extractedData : undefined,
      linkedEncounterIds: encounterLinks.map((link) => link.encounterId),
    }));
  }

  /** Documents attached to one exam, for the Attached Docs tab. */
  async listForEncounter(practiceId: string, encounterId: string) {
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, practiceId },
      select: { id: true },
    });
    if (!encounter) throw new NotFoundException('Encounter not found');

    const links = await this.prisma.encounterDocument.findMany({
      where: { encounterId },
      orderBy: { linkedAt: 'desc' },
      select: {
        linkedAt: true,
        document: { select: LIST_FIELDS },
        linkedBy: { select: { firstName: true, lastName: true } },
      },
    });
    return links.map((link) => ({ ...link.document, linkedAt: link.linkedAt, linkedBy: link.linkedBy }));
  }

  /** Fetches one document's metadata and bytes for viewing/downloading. */
  async getContent(practiceId: string, id: string) {
    const doc = await this.getOwned(practiceId, id);
    const data = await this.blobs.download('documents', doc.blobPath);
    return { doc, data };
  }

  /**
   * Edits classification and transcribed values. The stored bytes are never
   * replaced — a corrected scan is a new upload. Changing `extractedData`
   * drops the record back to PENDING_REVIEW so an earlier attestation can
   * never carry over to values nobody has checked.
   */
  async update(practiceId: string, id: string, dto: UpdateDocumentDto) {
    const doc = await this.getOwned(practiceId, id);
    if (dto.extractedData) this.validateExtractedData(dto.extractedData);

    const resetsReview =
      dto.extractedData !== undefined && doc.reviewStatus !== DocumentReviewStatus.PENDING_REVIEW;

    return this.prisma.document.update({
      where: { id },
      data: {
        kind: dto.kind,
        category: dto.category,
        externalProvider: dto.externalProvider,
        documentDate: dto.documentDate ? new Date(dto.documentDate) : undefined,
        extractedData: (dto.extractedData ?? undefined) as Prisma.InputJsonValue | undefined,
        ...(resetsReview
          ? { reviewStatus: DocumentReviewStatus.PENDING_REVIEW, reviewedById: null, reviewedAt: null }
          : {}),
      },
      select: LIST_FIELDS,
    });
  }

  /**
   * Attaches an existing chart document to an exam. Idempotent: re-linking an
   * already-linked document returns the existing link instead of erroring.
   */
  async link(practiceId: string, documentId: string, encounterId: string, user: JwtPayload) {
    const doc = await this.getOwned(practiceId, documentId);
    await this.getLinkableEncounter(practiceId, encounterId, doc.patientId);

    const existing = await this.prisma.encounterDocument.findUnique({
      where: { encounterId_documentId: { encounterId, documentId } },
    });
    if (existing) return existing;

    const link = await this.prisma.encounterDocument.create({
      data: { encounterId, documentId, linkedById: user.sub },
    });
    await this.audit.log({
      practiceId,
      actorId: user.sub,
      action: 'UPDATE',
      entityType: 'documents',
      entityId: documentId,
      patientId: doc.patientId,
      detail: `Linked document to encounter ${encounterId}`,
    });
    return link;
  }

  /**
   * Detaches a document from an exam. The file and its chart record survive —
   * other visits may still reference it.
   */
  async unlink(practiceId: string, documentId: string, encounterId: string, user: JwtPayload) {
    const doc = await this.getOwned(practiceId, documentId);
    await this.getLinkableEncounter(practiceId, encounterId, doc.patientId);

    const deleted = await this.prisma.encounterDocument.deleteMany({
      where: { encounterId, documentId },
    });
    if (deleted.count === 0) throw new NotFoundException('Document is not attached to this encounter');

    await this.audit.log({
      practiceId,
      actorId: user.sub,
      action: 'UPDATE',
      entityType: 'documents',
      entityId: documentId,
      patientId: doc.patientId,
      detail: `Unlinked document from encounter ${encounterId}`,
    });
    return { encounterId, documentId, unlinked: true };
  }

  /**
   * Clinical attestation that the transcribed values match the source image.
   * Only technicians and doctors may sign off; nothing downstream should copy
   * extracted values into an exam before this passes.
   */
  async review(
    practiceId: string,
    id: string,
    user: JwtPayload,
    status: typeof DocumentReviewStatus.REVIEWED | typeof DocumentReviewStatus.REJECTED,
  ) {
    if (!isClinical(user)) {
      throw new ForbiddenException('Only clinical staff can review imported documents');
    }
    const doc = await this.getOwned(practiceId, id);

    const reviewed = await this.prisma.document.update({
      where: { id },
      data: { reviewStatus: status, reviewedById: user.sub, reviewedAt: new Date() },
      select: LIST_FIELDS,
    });
    await this.audit.log({
      practiceId,
      actorId: user.sub,
      action: 'UPDATE',
      entityType: 'documents',
      entityId: id,
      patientId: doc.patientId,
      detail: `Document review: ${status}`,
    });
    return reviewed;
  }

  /** Loads a document or throws 404 outside the caller's practice. */
  private async getOwned(practiceId: string, id: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id, patient: { practiceId } },
    });
    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  /**
   * Resolves an encounter that may accept document links. Signed exams are
   * immutable and voided ones are read-only, matching EncountersService. The
   * patient check stops one chart's records from being stapled into another's
   * exam.
   */
  private async getLinkableEncounter(practiceId: string, encounterId: string, patientId: string) {
    const encounter = await this.prisma.encounter.findFirst({
      where: { id: encounterId, practiceId },
      select: { id: true, patientId: true, status: true },
    });
    if (!encounter) throw new NotFoundException('Encounter not found');
    if (encounter.patientId !== patientId) {
      throw new BadRequestException('Document belongs to a different patient');
    }
    if (encounter.status === EncounterStatus.SIGNED) {
      throw new BadRequestException('Signed encounters are immutable; add an addendum instead');
    }
    if (encounter.status === EncounterStatus.VOIDED) {
      throw new BadRequestException('Voided encounters are read-only');
    }
    return encounter;
  }

  /**
   * Runs class-validator over transcribed values and throws one 400 listing
   * every invalid field, mirroring PrescriptionsService.validateValues.
   */
  private validateExtractedData(data: Record<string, unknown>) {
    const errors = validateSync(plainToInstance(ExtractedDataDto, data), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    if (errors.length > 0) {
      const detail = flattenErrors(errors).join(' | ');
      throw new BadRequestException(`Invalid extracted values — ${detail}`);
    }
  }
}

/**
 * Roles allowed to see and attest transcribed clinical values. ADMIN is
 * included because it clears every role gate elsewhere in the app.
 */
function isClinical(user: JwtPayload): boolean {
  return user.role === Role.DOCTOR || user.role === Role.TECHNICIAN || user.role === Role.ADMIN;
}

/** Flattens nested class-validator errors (od.sphere, os.axis) into messages. */
function flattenErrors(errors: ReturnType<typeof validateSync>, prefix = ''): string[] {
  return errors.flatMap((error) => {
    const path = prefix ? `${prefix}.${error.property}` : error.property;
    const own = Object.values(error.constraints ?? {}).map((message) => `${path}: ${message}`);
    return [...own, ...flattenErrors(error.children ?? [], path)];
  });
}
