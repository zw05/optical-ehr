import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BlobStorageService } from '../documents/blob-storage.service';
import { UpdatePracticeDto } from './practice.dto';

const LOGO_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg']);

@Injectable()
export class PracticeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blobs: BlobStorageService,
  ) {}

  async get(practiceId: string) {
    const practice = await this.prisma.practice.findUnique({ where: { id: practiceId } });
    if (!practice) throw new NotFoundException('Practice not found');
    return practice;
  }

  async branding() {
    const practice = await this.prisma.practice.findFirst({ select: { name: true } });
    return { name: practice?.name ?? 'popEHR' };
  }

  async update(practiceId: string, dto: UpdatePracticeDto) {
    await this.get(practiceId);
    return this.prisma.practice.update({
      where: { id: practiceId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.phone !== undefined ? { phone: emptyToNull(dto.phone) } : {}),
        ...(dto.fax !== undefined ? { fax: emptyToNull(dto.fax) } : {}),
        ...(dto.address !== undefined ? { address: emptyToNull(dto.address) } : {}),
        ...(dto.email !== undefined ? { email: emptyToNull(dto.email) } : {}),
        ...(dto.website !== undefined ? { website: emptyToNull(dto.website) } : {}),
        ...(dto.npi !== undefined ? { npi: emptyToNull(dto.npi) } : {}),
        ...(dto.taxId !== undefined ? { taxId: emptyToNull(dto.taxId) } : {}),
        ...(dto.timezone !== undefined ? { timezone: emptyToNull(dto.timezone) } : {}),
        ...(dto.hours !== undefined ? { hours: dto.hours as object } : {}),
      },
    });
  }

  async uploadLogo(practiceId: string, fileName: string, contentType: string, dataBase64: string) {
    if (!LOGO_TYPES.has(contentType.toLowerCase())) {
      throw new BadRequestException('Logo must be a PNG or JPEG');
    }
    const data = Buffer.from(dataBase64, 'base64');
    if (data.length > 1024 * 1024) {
      throw new BadRequestException('Logo must be 1 MB or smaller');
    }
    const stored = await this.blobs.upload('logos', fileName, data);
    return this.prisma.practice.update({
      where: { id: practiceId },
      data: { logoUrl: stored.blobPath },
    });
  }

  async downloadLogo(practiceId: string) {
    const practice = await this.get(practiceId);
    if (!practice.logoUrl) throw new NotFoundException('No logo uploaded');
    const data = await this.blobs.download('logos', practice.logoUrl);
    const jpeg = practice.logoUrl.toLowerCase().includes('.jpg') || practice.logoUrl.toLowerCase().includes('.jpeg');
    return { data, contentType: jpeg ? 'image/jpeg' : 'image/png' };
  }
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
