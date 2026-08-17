import { Injectable, NotFoundException } from '@nestjs/common';
import { VerificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInsuranceDto, UpdateInsuranceDto } from './insurance.dto';

@Injectable()
export class InsuranceService {
  constructor(private readonly prisma: PrismaService) {}

  async create(practiceId: string, dto: CreateInsuranceDto) {
    await this.assertPatient(practiceId, dto.patientId);
    const fromCatalog = await this.resolvePayer(practiceId, dto.acceptedPayerId, dto.payerName);
    return this.prisma.insurancePolicy.create({
      data: {
        patientId: dto.patientId,
        acceptedPayerId: fromCatalog.id,
        payerName: fromCatalog.name,
        planName: dto.planName,
        memberId: dto.memberId,
        groupNumber: dto.groupNumber,
        subscriberName: dto.subscriberName,
        relation: dto.relation,
        effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : undefined,
        expirationDate: dto.expirationDate ? new Date(dto.expirationDate) : undefined,
        isVision: dto.isVision ?? fromCatalog.isVision,
        priority: dto.priority,
        cardFrontDocId: dto.cardFrontDocId,
        cardBackDocId: dto.cardBackDocId,
        notes: dto.notes,
      },
    });
  }

  async listForPatient(practiceId: string, patientId: string) {
    await this.assertPatient(practiceId, patientId);
    return this.prisma.insurancePolicy.findMany({
      where: { patientId },
      orderBy: { priority: 'asc' },
    });
  }

  async update(practiceId: string, id: string, dto: UpdateInsuranceDto) {
    const policy = await this.prisma.insurancePolicy.findFirst({
      where: { id, patient: { practiceId } },
    });
    if (!policy) throw new NotFoundException('Insurance policy not found');
    const fromCatalog =
      dto.acceptedPayerId !== undefined || dto.payerName !== undefined
        ? await this.resolvePayer(practiceId, dto.acceptedPayerId, dto.payerName ?? policy.payerName)
        : null;
    return this.prisma.insurancePolicy.update({
      where: { id },
      data: {
        ...(dto.planName !== undefined ? { planName: dto.planName } : {}),
        ...(dto.memberId !== undefined ? { memberId: dto.memberId } : {}),
        ...(dto.groupNumber !== undefined ? { groupNumber: dto.groupNumber } : {}),
        ...(dto.subscriberName !== undefined ? { subscriberName: dto.subscriberName } : {}),
        ...(dto.relation !== undefined ? { relation: dto.relation } : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.isVision !== undefined && !fromCatalog ? { isVision: dto.isVision } : {}),
        ...(fromCatalog
          ? {
              acceptedPayerId: fromCatalog.id,
              payerName: fromCatalog.name,
              isVision: dto.isVision ?? fromCatalog.isVision,
            }
          : {}),
        ...(dto.effectiveDate ? { effectiveDate: new Date(dto.effectiveDate) } : {}),
        ...(dto.expirationDate ? { expirationDate: new Date(dto.expirationDate) } : {}),
      },
    });
  }

  async setVerification(practiceId: string, id: string, status: VerificationStatus) {
    const policy = await this.prisma.insurancePolicy.findFirst({
      where: { id, patient: { practiceId } },
    });
    if (!policy) throw new NotFoundException('Insurance policy not found');
    return this.prisma.insurancePolicy.update({
      where: { id },
      data: {
        verification: status,
        verifiedAt: status === VerificationStatus.VERIFIED ? new Date() : null,
      },
    });
  }

  private async resolvePayer(practiceId: string, acceptedPayerId?: string, payerName?: string) {
    if (acceptedPayerId) {
      const payer = await this.prisma.acceptedPayer.findFirst({
        where: { id: acceptedPayerId, practiceId },
      });
      if (!payer) throw new NotFoundException('Accepted payer not found');
      return { id: payer.id, name: payer.name, isVision: payer.isVision };
    }
    const name = payerName?.trim();
    if (!name) throw new NotFoundException('Select an accepted insurance type');
    const byName = await this.prisma.acceptedPayer.findFirst({
      where: { practiceId, name, isActive: true },
    });
    if (byName) return { id: byName.id, name: byName.name, isVision: byName.isVision };
    return { id: null as string | null, name, isVision: true };
  }

  private async assertPatient(practiceId: string, patientId: string) {
    const found = await this.prisma.patient.findFirst({
      where: { id: patientId, practiceId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Patient not found');
  }
}
