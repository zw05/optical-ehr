import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { IsArray, IsString } from 'class-validator';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { TemplatesService, TemplateSectionInput } from './templates.service';

class CreateTemplateDto {
  @IsString()
  name!: string;

  @IsArray()
  sections!: TemplateSectionInput[];
}

class PublishVersionDto {
  @IsArray()
  sections!: TemplateSectionInput[];
}

/** Customizable exam-form layouts (versioned like report templates). */
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  /** GET /api/templates — active exam templates. */
  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.templates.list(user.practiceId);
  }

  /** POST /api/templates — create a new exam template (doctor or admin). */
  @Post()
  @Roles(Role.ADMIN, Role.DOCTOR)
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateTemplateDto) {
    return this.templates.create(user.practiceId, dto.name, dto.sections);
  }

  /** POST /api/templates/:id/versions — publish an edited layout as a new version. */
  @Post(':id/versions')
  @Roles(Role.ADMIN, Role.DOCTOR)
  publish(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: PublishVersionDto) {
    return this.templates.publishNewVersion(user.practiceId, id, dto.sections);
  }
}
