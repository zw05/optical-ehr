import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
import { PdfRenderer } from './pdf-renderer';

@Module({
  imports: [DocumentsModule],
  providers: [ReportsService, PdfRenderer],
  controllers: [ReportsController],
})
export class ReportsModule {}
