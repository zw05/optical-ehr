import { Module } from '@nestjs/common';
import { RecallsService } from './recalls.service';
import { RecallsController } from './recalls.controller';

@Module({
  providers: [RecallsService],
  controllers: [RecallsController],
})
export class RecallsModule {}
