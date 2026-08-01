import { Injectable, NotFoundException } from '@nestjs/common';
import { VerificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInsuranceDto, UpdateInsuranceDto } from './insurance.dto';

/**
 * Insurance record keeping only — stores payer/member details and manual
 * verification status. No eligibility checks or claim submission in v1.
 */
@Injectable()
export class InsuranceService {
  constructor(private readonly prisma: PrismaService) {}

  /** Adds a policy to a patient (payer, member/group IDs, dates, priority). */
  async create(practiceId: string, dto: CreateInsuranceDto) {
    await this.assertPatient(practiceId, dto.patientId);
    return this.prisma.insurancePolicy.create({
      data: {
        ...dto,
        effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : undefined,
        expirationDate: dto.expirationDate ? new Date(dto.expirationDate) : undefined,
      },
    });
  }

  /** Lists a patient's policies ordered primary-first. */
  async listForPatient(practiceId: string, patientId: string) {
    await this.assertPatient(practiceId, patientId);
    return this.prisma.insurancePolicy.findMany({
      where: { patientId },
      orderBy: { priority: 'asc' },
    });
  }

  /** Edits policy fields; ownership is checked through the patient's practice. */
  async update(practiceId: string, id: string, dto: UpdateInsuranceDto) {
    const policy = await this.prisma.insurancePolicy.findFirst({
      where: { id, patient: { practiceId } },
    });
    if (!policy) throw new NotFoundException('Insurance policy not found');
    const { effectiveDate, expirationDate, ...rest } = dto;
    return this.prisma.insurancePolicy.update({
      where: { id },
      data: {
        ...rest,
        ...(effectiveDate ? { effectiveDate: new Date(effectiveDate) } : {}),
        ...(expirationDate ? { expirationDate: new Date(expirationDate) } : {}),
      },
    });
  }

  /**
   * Records the result of a manual verification call/portal check.
   * Stamps verifiedAt when set to VERIFIED; clears it otherwise.
   */
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

  /** Throws 404 unless the patient exists inside the caller's practice. */
  private async assertPatient(practiceId: string, patientId: string) {
    const found = await this.prisma.patient.findFirst({
      where: { id: patientId, practiceId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Patient not found');
  }
}
