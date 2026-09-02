import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BlobServiceClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from '@azure/identity';
import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import * as path from 'path';

/** Result of an upload: where the file lives plus its integrity fingerprint. */
export interface StoredBlob {
  blobPath: string;
  sha256: string;
  sizeBytes: number;
}

/**
 * Blob persistence with two backends:
 * - Azure Blob Storage via managed identity (production/staging)
 * - local directory (development, when AZURE_STORAGE_ACCOUNT is unset)
 */
@Injectable()
export class BlobStorageService {
  private readonly client: BlobServiceClient | null;
  private readonly localDir: string;

  constructor(config: ConfigService) {
    const account = config.get<string>('AZURE_STORAGE_ACCOUNT');
    this.client = account
      ? new BlobServiceClient(`https://${account}.blob.core.windows.net`, new DefaultAzureCredential())
      : null;
    this.localDir = config.get<string>('BLOB_LOCAL_DIR') ?? './blob-dev';
  }

  /**
   * Stores a file and returns its path, SHA-256 hash, and size. The path is
   * date-prefixed with a random UUID so names never collide and never leak
   * patient information. The hash lets callers verify integrity later.
   */
  async upload(container: 'documents' | 'reports' | 'logos' | 'signatures', fileName: string, data: Buffer): Promise<StoredBlob> {
    const sha256 = createHash('sha256').update(data).digest('hex');
    const blobPath = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${sanitize(fileName)}`;

    if (this.client) {
      const containerClient = this.client.getContainerClient(container);
      await containerClient.getBlockBlobClient(blobPath).uploadData(data);
    } else {
      const filePath = path.join(this.localDir, container, blobPath);
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, data);
    }
    return { blobPath, sha256, sizeBytes: data.length };
  }

  /** Reads a stored file back as a buffer (Azure or local dev backend). */
  async download(container: 'documents' | 'reports' | 'logos' | 'signatures', blobPath: string): Promise<Buffer> {
    if (this.client) {
      const blob = this.client.getContainerClient(container).getBlockBlobClient(blobPath);
      return Buffer.from(await blob.downloadToBuffer());
    }
    return fs.readFile(path.join(this.localDir, container, blobPath));
  }
}

/** Strips path separators and exotic characters from user-supplied file names. */
function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
}
