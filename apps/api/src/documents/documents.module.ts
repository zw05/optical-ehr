import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocumentsController } from './documents.controller';
import { BlobStorageService } from './blob-storage.service';

@Module({
  providers: [DocumentsService, BlobStorageService],
  controllers: [DocumentsController],
  exports: [BlobStorageService, DocumentsService],
})
export class DocumentsModule {}
