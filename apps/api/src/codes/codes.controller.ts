import { Controller, Get, Query } from '@nestjs/common';
import { CodesService } from './codes.service';

/** Reference code catalogs (ICD-10 lookup). Any authenticated role. */
@Controller('codes')
export class CodesController {
  constructor(private readonly codes: CodesService) {}

  /** GET /api/codes/icd10?q=...&take=... — optometry ICD-10 suggestions. */
  @Get('icd10')
  searchIcd10(@Query('q') q = '', @Query('take') take?: string) {
    return this.codes.searchIcd10(q, take ? Number(take) : undefined);
  }
}
