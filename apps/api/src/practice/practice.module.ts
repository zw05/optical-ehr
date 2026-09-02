import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { PracticeController } from './practice.controller';
import { PracticeService } from './practice.service';

@Module({
  imports: [DocumentsModule],
  controllers: [PracticeController],
  providers: [PracticeService],
})
export class PracticeModule {}
