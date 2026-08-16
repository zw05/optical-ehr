import { Module } from '@nestjs/common';
import { CodesController } from './codes.controller';
import { CodesService } from './codes.service';

@Module({
  providers: [CodesService],
  controllers: [CodesController],
})
export class CodesModule {}
