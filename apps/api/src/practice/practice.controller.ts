import { Body, Controller, Get, Patch, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { RequirePermission } from '../auth/permission.decorator';
import { Permission } from '../auth/permissions';
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

  /** PATCH /api/practice — update the store profile. */
  @Patch()
  @RequirePermission(Permission.STORE_PROFILE_EDIT)
  update(@CurrentUser() user: JwtPayload, @Body() dto: UpdatePracticeDto) {
    return this.practice.update(user.practiceId, dto);
  }

  /** POST /api/practice/logo — upload PNG/JPEG practice logo. */
  @Post('logo')
  @RequirePermission(Permission.STORE_PROFILE_EDIT)
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
