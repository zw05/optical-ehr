import { Module } from '@nestjs/common';
import { EncountersService } from './encounters.service';
import { EncountersController } from './encounters.controller';
import { TemplatesController } from './templates.controller';
import { TemplatesService } from './templates.service';

@Module({
  providers: [EncountersService, TemplatesService],
  controllers: [EncountersController, TemplatesController],
  exports: [EncountersService],
})
export class EncountersModule {}
