import { Module } from '@nestjs/common';
import { OrthoKService } from './ortho-k.service';
import { OrthoKController } from './ortho-k.controller';

@Module({
  providers: [OrthoKService],
  controllers: [OrthoKController],
})
export class OrthoKModule {}
