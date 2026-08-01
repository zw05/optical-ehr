import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BlobStorageService } from './blob-storage.service';

/**
 * Patient file attachments (insurance card scans, external records, etc.).
 * Bytes live in blob storage; PostgreSQL keeps the metadata and hash.
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blobs: BlobStorageService,
  ) {}

  /** Stores the file bytes and creates the Document metadata row. */
  async upload(params: {
    practiceId: string;
    patientId: string;
    fileName: string;
    contentType: string;
    category?: string;
    uploadedById: string;
    data: Buffer;
  }) {
    const patient = await this.prisma.patient.findFirst({
      where: { id: params.patientId, practiceId: params.practiceId },
      select: { id: true },
    });
    if (!patient) throw new NotFoundException('Patient not found');

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
        uploadedById: params.uploadedById,
      },
    });
  }

  /** Metadata-only listing for the chart's documents tab (no file bytes). */
  async list(practiceId: string, patientId: string) {
    return this.prisma.document.findMany({
      where: { patientId, patient: { practiceId } },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        fileName: true,
        contentType: true,
        category: true,
        sizeBytes: true,
        createdAt: true,
      },
    });
  }

  /** Fetches one document's metadata and bytes for viewing/downloading. */
  async getContent(practiceId: string, id: string) {
    const doc = await this.prisma.document.findFirst({
      where: { id, patient: { practiceId } },
    });
    if (!doc) throw new NotFoundException('Document not found');
    const data = await this.blobs.download('documents', doc.blobPath);
    return { doc, data };
  }
}
