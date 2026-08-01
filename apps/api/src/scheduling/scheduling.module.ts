import { Module } from '@nestjs/common';
import { SchedulingService } from './scheduling.service';
import { SchedulingController } from './scheduling.controller';

@Module({
  providers: [SchedulingService],
  controllers: [SchedulingController],
})
export class SchedulingModule {}
