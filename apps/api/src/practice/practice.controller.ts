import { Body, Controller, Get, Patch, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { Roles } from '../auth/roles.decorator';
import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { PracticeService } from './practice.service';
import { UpdatePracticeDto, UploadPracticeLogoDto } from './practice.dto';

@Controller('practice')
export class PracticeController {
  constructor(private readonly practice: PracticeService) {}

  /** Public store name for the login screen (no PHI). */
  @Public()
  @Get('branding')
  branding() {
    return this.practice.branding();
  }

  /** GET /api/practice — store identity for branding and settings. */
  @Get()
  get(@CurrentUser() user: JwtPayload) {
    return this.practice.get(user.practiceId);
  }

  /** PATCH /api/practice — admin updates store profile. */
  @Patch()
  @Roles(Role.ADMIN)
  update(@CurrentUser() user: JwtPayload, @Body() dto: UpdatePracticeDto) {
    return this.practice.update(user.practiceId, dto);
  }

  /** POST /api/practice/logo — upload PNG/JPEG practice logo. */
  @Post('logo')
  @Roles(Role.ADMIN)
  uploadLogo(@CurrentUser() user: JwtPayload, @Body() dto: UploadPracticeLogoDto) {
    return this.practice.uploadLogo(user.practiceId, dto.fileName, dto.contentType, dto.dataBase64);
  }

  /** GET /api/practice/logo — binary logo for the app shell. */
  @Get('logo')
  async getLogo(@CurrentUser() user: JwtPayload, @Res() res: Response) {
    const { data, contentType } = await this.practice.downloadLogo(user.practiceId);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.send(data);
  }
}
