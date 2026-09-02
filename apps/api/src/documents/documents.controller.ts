import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { DocumentsService } from './documents.service';
import {
  LinkDocumentDto,
  ListDocumentsDto,
  ReviewDocumentDto,
  UpdateDocumentDto,
  UploadDocumentDto,
} from './documents.dto';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Content types a scanner or phone camera realistically produces. */
const ALLOWED_CONTENT_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/heic',
  'image/webp',
]);

/**
 * Patient file attachments: insurance cards, outside records, imported paper
 * prescriptions and keratometry printouts. Documents belong to the chart;
 * link/unlink attaches them to the exams they are relevant to.
 */
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  /**
   * POST /api/documents — upload a patient file as base64 JSON. Rejects empty
   * payloads, anything over 25 MB, and formats we cannot render in the chart.
   */
  @Post()
  @Roles(Role.RECEPTIONIST, Role.TECHNICIAN, Role.OPTICIAN, Role.DOCTOR)
  upload(@CurrentUser() user: JwtPayload, @Body() dto: UploadDocumentDto) {
    const data = Buffer.from(dto.dataBase64, 'base64');
    if (data.length === 0) throw new BadRequestException('Empty file');
    if (data.length > MAX_UPLOAD_BYTES) throw new BadRequestException('File exceeds 25 MB limit');
    if (!ALLOWED_CONTENT_TYPES.has(dto.contentType)) {
      throw new BadRequestException(
        `Unsupported file type ${dto.contentType} — upload a PDF or image scan`,
      );
    }
    return this.documents.upload({
      ...dto,
      practiceId: user.practiceId,
      uploadedById: user.sub,
      data,
    });
  }

  /**
   * PATCH /api/documents/:id/review — clinical sign-off that the transcribed
   * values match the source image. Declared before `PATCH :id` to keep the
   * route table readable.
   */
  @Patch(':id/review')
  @Roles(Role.TECHNICIAN, Role.DOCTOR)
  review(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: ReviewDocumentDto) {
    return this.documents.review(user.practiceId, id, user, dto.status);
  }

  /** GET /api/documents/patient/:patientId — list a chart's attachments. */
  @Get('patient/:patientId')
  list(
    @CurrentUser() user: JwtPayload,
    @Param('patientId') patientId: string,
    @Query() query: ListDocumentsDto,
  ) {
    return this.documents.list(user.practiceId, patientId, user, query);
  }

  /**
   * GET /api/documents/encounter/:encounterId — documents attached to one exam.
   * Clinical staff only, matching the encounter endpoints.
   */
  @Get('encounter/:encounterId')
  @Roles(Role.TECHNICIAN, Role.DOCTOR)
  listForEncounter(@CurrentUser() user: JwtPayload, @Param('encounterId') encounterId: string) {
    return this.documents.listForEncounter(user.practiceId, encounterId);
  }

  /** GET /api/documents/:id/content — stream the file back to the browser. */
  @Get(':id/content')
  async download(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Res() res: Response) {
    const { doc, data } = await this.documents.getContent(user.practiceId, id);
    res.setHeader('Content-Type', doc.contentType);
    res.setHeader('Content-Disposition', `inline; filename="${doc.fileName}"`);
    res.send(data);
  }

  /**
   * PATCH /api/documents/:id — reclassify a document or correct the values
   * transcribed off it. The stored bytes are never replaced.
   */
  @Patch(':id')
  @Roles(Role.RECEPTIONIST, Role.TECHNICIAN, Role.OPTICIAN, Role.DOCTOR)
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateDocumentDto) {
    return this.documents.update(user.practiceId, id, dto);
  }

  /** POST /api/documents/:id/link — attach an existing document to an exam. */
  @Post(':id/link')
  @Roles(Role.TECHNICIAN, Role.DOCTOR)
  link(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: LinkDocumentDto) {
    return this.documents.link(user.practiceId, id, dto.encounterId, user);
  }

  /**
   * DELETE /api/documents/:id/link/:encounterId — detach from one exam. The
   * file stays in the chart for other visits.
   */
  @Delete(':id/link/:encounterId')
  @Roles(Role.TECHNICIAN, Role.DOCTOR)
  unlink(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('encounterId') encounterId: string,
  ) {
    return this.documents.unlink(user.practiceId, id, encounterId, user);
  }
}
