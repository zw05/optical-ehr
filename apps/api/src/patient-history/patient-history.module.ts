import { Module } from '@nestjs/common';
import { PatientHistoryController } from './patient-history.controller';
import { PatientHistoryService } from './patient-history.service';

@Module({
  controllers: [PatientHistoryController],
  providers: [PatientHistoryService],
})
export class PatientHistoryModule {}
