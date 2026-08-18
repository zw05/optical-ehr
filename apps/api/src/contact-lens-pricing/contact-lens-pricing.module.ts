import { Module } from '@nestjs/common';
import { ContactLensPricingController } from './contact-lens-pricing.controller';
import { ContactLensPricingService } from './contact-lens-pricing.service';

@Module({
  controllers: [ContactLensPricingController],
  providers: [ContactLensPricingService],
})
export class ContactLensPricingModule {}
