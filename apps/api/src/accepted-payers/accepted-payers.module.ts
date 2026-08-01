import { Module } from '@nestjs/common';
import { AcceptedPayersService } from './accepted-payers.service';
import { AcceptedPayersController } from './accepted-payers.controller';

@Module({
  providers: [AcceptedPayersService],
  controllers: [AcceptedPayersController],
})
export class AcceptedPayersModule {}
