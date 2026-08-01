import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * One configurable section of the exam form: whether it shows, which fields
 * must be filled before sign-off, and any practice-defined custom fields.
 */
export interface TemplateSectionInput {
  key: string;
  title: string;
  enabled: boolean;
  requiredFields?: string[];
  customFields?: { key: string; label: string; type: 'text' | 'number' | 'boolean' | 'select'; options?: string[] }[];
}

/** Default comprehensive-exam template sections (tabbed exam form). */
export const DEFAULT_EXAM_SECTIONS: TemplateSectionInput[] = [
  { key: 'hpi', title: 'HPI', enabled: true, requiredFields: ['complaints'] },
  { key: 'socialHistory', title: 'Social History', enabled: true },
  { key: 'medicalHistory', title: 'Medical History', enabled: true },
  { key: 'ros', title: 'ROS', enabled: true },
  { key: 'prelimBinocular', title: 'Preliminary/Binocular', enabled: true, requiredFields: ['cvaOdDistance', 'cvaOsDistance'] },
  { key: 'refractionCl', title: 'Refraction/Contact Lens', enabled: true },
  { key: 'externalInternal', title: 'External/Internal', enabled: true, requiredFields: ['iopOd', 'iopOs', 'iopMethod'] },
  { key: 'additionalTests', title: 'Additional Tests', enabled: true },
  { key: 'plan', title: 'Procedure Impression/Plan', enabled: true, requiredFields: ['assessment'] },
];

/** Manages the practice's customizable exam-form layouts. */
@Injectable()
export class TemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Active templates, used by the exam form and the template editor. */
  list(practiceId: string) {
    return this.prisma.examTemplate.findMany({
      where: { practiceId, isActive: true },
      orderBy: [{ name: 'asc' }, { version: 'desc' }],
    });
  }

  /** Creates a brand-new template (version 1) from a section list. */
  create(practiceId: string, name: string, sections: TemplateSectionInput[]) {
    return this.prisma.examTemplate.create({
      data: { practiceId, name, sections: sections as object[] },
    });
  }

  /**
   * Templates are versioned: editing publishes a new version and retires the
   * old one, so signed encounters keep pointing at the exact layout used.
   */
  async publishNewVersion(practiceId: string, templateId: string, sections: TemplateSectionInput[]) {
    const current = await this.prisma.examTemplate.findFirst({
      where: { id: templateId, practiceId },
    });
    if (!current) throw new NotFoundException('Template not found');

    const [, next] = await this.prisma.$transaction([
      this.prisma.examTemplate.update({ where: { id: templateId }, data: { isActive: false } }),
      this.prisma.examTemplate.create({
        data: {
          practiceId,
          name: current.name,
          version: current.version + 1,
          sections: sections as object[],
        },
      }),
    ]);
    return next;
  }
}
