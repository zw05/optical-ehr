import { Body, Controller, Param, Patch, Post, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { IsBase64, IsIn, IsObject, IsOptional, IsString } from 'class-validator';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { ReportsService } from './reports.service';
import { ReportLayout } from './pdf-renderer';

class CreateReportTemplateDto {
  @IsString()
  name!: string;

  @IsString()
  @IsIn(['spectacle-rx', 'contact-lens-rx', 'exam-summary', 'order-summary'])
  kind!: string;

  @IsObject()
  layout!: ReportLayout;
}

class PublishLayoutDto {
  @IsObject()
  layout!: ReportLayout;
}

class PreviewLayoutDto {
  @IsObject()
  layout!: ReportLayout;

  @IsOptional()
  @IsIn(['spectacle-rx', 'contact-lens-rx', 'exam-summary', 'order-summary'])
  kind?: string;
}

class DuplicateTemplateDto {
  @IsString()
  name!: string;
}

class UploadLogoDto {
  @IsString()
  fileName!: string;

  @IsString()
  contentType!: string;

  @IsBase64()
  dataBase64!: string;
}

/** Versioned PDF report templates and prescription PDF generation. */
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** GET /api/reports/templates — active report layouts. */
  @Get('templates')
  listTemplates(@CurrentUser() user: JwtPayload) {
    return this.reports.listTemplates(user.practiceId);
  }

  /** POST /api/reports/templates — create a report layout (admin only). */
  @Post('templates')
  @Roles(Role.ADMIN)
  createTemplate(@CurrentUser() user: JwtPayload, @Body() dto: CreateReportTemplateDto) {
    return this.reports.createTemplate(user.practiceId, dto.name, dto.kind, dto.layout);
  }

  /**
   * POST /api/reports/templates/preview — render a sample PDF from a layout
   * without persisting (admin only). Used by Settings live preview.
   */
  @Post('templates/preview')
  @Roles(Role.ADMIN)
  async previewTemplate(
    @CurrentUser() user: JwtPayload,
    @Body() dto: PreviewLayoutDto,
    @Res() res: Response,
  ) {
    const pdf = await this.reports.previewLayout(user.practiceId, dto.layout, dto.kind ?? 'spectacle-rx');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="rx-preview.pdf"');
    res.send(pdf);
  }

  /**
   * POST /api/reports/templates/logo — upload a PNG/JPEG logo for Rx templates
   * (admin only). Returns the blob path to store in layout.logoBlobPath.
   */
  @Post('templates/logo')
  @Roles(Role.ADMIN)
  uploadLogo(@Body() dto: UploadLogoDto) {
    const data = Buffer.from(dto.dataBase64, 'base64');
    return this.reports.uploadLogo(dto.fileName, dto.contentType, data);
  }

  /**
   * POST /api/reports/templates/signature — upload a PNG/JPEG provider signature
   * (admin only). Returns the blob path to store in layout.signatureBlobPath.
   */
  @Post('templates/signature')
  @Roles(Role.ADMIN)
  uploadSignature(@Body() dto: UploadLogoDto) {
    const data = Buffer.from(dto.dataBase64, 'base64');
    return this.reports.uploadSignature(dto.fileName, dto.contentType, data);
  }

  /** POST /api/reports/templates/:id/versions — publish an edited layout. */
  @Post('templates/:id/versions')
  @Roles(Role.ADMIN)
  publishVersion(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: PublishLayoutDto) {
    return this.reports.publishTemplateVersion(user.practiceId, id, dto.layout);
  }

  /** POST /api/reports/templates/:id/duplicate — copy a template under a new name. */
  @Post('templates/:id/duplicate')
  @Roles(Role.ADMIN)
  duplicate(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: DuplicateTemplateDto) {
    return this.reports.duplicateTemplate(user.practiceId, id, dto.name);
  }

  /** PATCH /api/reports/templates/:id/default — mark this template as the kind's default. */
  @Patch('templates/:id/default')
  @Roles(Role.ADMIN)
  setDefault(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.reports.setDefaultTemplate(user.practiceId, id);
  }

  /** PATCH /api/reports/templates/:id/archive — soft-delete a non-default template. */
  @Patch('templates/:id/archive')
  @Roles(Role.ADMIN)
  archive(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.reports.archiveTemplate(user.practiceId, id);
  }

  /**
   * POST /api/reports/prescriptions/:prescriptionId — generate, store, and
   * return the Rx PDF. The new report id is echoed in the X-Report-Id header.
   */
  @Post('prescriptions/:prescriptionId')
  @Roles(Role.DOCTOR, Role.OPTICIAN, Role.RECEPTIONIST)
  async generateForPrescription(
    @CurrentUser() user: JwtPayload,
    @Param('prescriptionId') prescriptionId: string,
    @Res() res: Response,
  ) {
    const { report, pdf } = await this.reports.generatePrescriptionReport(
      user.practiceId,
      prescriptionId,
      user,
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Report-Id', report.id);
    res.send(pdf);
  }

  /**
   * POST /api/reports/orders/:orderId — generate, store, and return the order
   * job paper. Available at any order status, including DRAFT.
   */
  @Post('orders/:orderId')
  @Roles(Role.DOCTOR, Role.OPTICIAN, Role.RECEPTIONIST)
  async generateForOrder(
    @CurrentUser() user: JwtPayload,
    @Param('orderId') orderId: string,
    @Res() res: Response,
  ) {
    const { report, pdf } = await this.reports.generateOrderReport(user.practiceId, orderId, user);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Report-Id', report.id);
    res.send(pdf);
  }

  /** GET /api/reports/:id/content — re-download a previously issued PDF. */
  @Get(':id/content')
  async download(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Res() res: Response) {
    const { pdf } = await this.reports.getReportContent(user.practiceId, id, user);
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdf);
  }
}
