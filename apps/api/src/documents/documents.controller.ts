import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { IsBase64, IsOptional, IsString, IsUUID } from 'class-validator';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { DocumentsService } from './documents.service';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

class UploadDocumentDto {
  @IsUUID()
  patientId!: string;

  @IsString()
  fileName!: string;

  @IsString()
  contentType!: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsBase64()
  dataBase64!: string;
}

/** Patient file attachments (insurance cards, external records, scans). */
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  /**
   * POST /api/documents — upload a patient file as base64 JSON.
   * Rejects empty payloads and anything over 15 MB.
   */
  @Post()
  @Roles(Role.RECEPTIONIST, Role.TECHNICIAN, Role.OPTICIAN, Role.DOCTOR)
  upload(@CurrentUser() user: JwtPayload, @Body() dto: UploadDocumentDto) {
    const data = Buffer.from(dto.dataBase64, 'base64');
    if (data.length === 0) throw new BadRequestException('Empty file');
    if (data.length > MAX_UPLOAD_BYTES) throw new BadRequestException('File exceeds 15 MB limit');
    return this.documents.upload({
      practiceId: user.practiceId,
      patientId: dto.patientId,
      fileName: dto.fileName,
      contentType: dto.contentType,
      category: dto.category,
      uploadedById: user.sub,
      data,
    });
  }

  /** GET /api/documents/patient/:patientId — list a chart's attachments. */
  @Get('patient/:patientId')
  list(@CurrentUser() user: JwtPayload, @Param('patientId') patientId: string) {
    return this.documents.list(user.practiceId, patientId);
  }

  /** GET /api/documents/:id/content — stream the file back to the browser. */
  @Get(':id/content')
  async download(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Res() res: Response) {
    const { doc, data } = await this.documents.getContent(user.practiceId, id);
    res.setHeader('Content-Type', doc.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${doc.fileName}"`);
    res.send(data);
  }
}
