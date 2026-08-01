import { Injectable, NotFoundException } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Internal practice to-do items (callbacks, order follow-ups, etc.). */
@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  /** Creates a task, optionally linked to a patient and assigned to a staff member. */
  create(
    practiceId: string,
    input: { title: string; detail?: string; assigneeId?: string; patientId?: string; dueDate?: Date },
  ) {
    return this.prisma.task.create({ data: { practiceId, ...input } });
  }

  /** Task board filtered by status and/or assignee, ordered by due date. */
  list(practiceId: string, filters: { status?: TaskStatus; assigneeId?: string }) {
    return this.prisma.task.findMany({
      where: { practiceId, ...filters },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      include: { assignee: { select: { firstName: true, lastName: true } } },
    });
  }

  /** Moves a task through OPEN → IN_PROGRESS → DONE. */
  async setStatus(practiceId: string, id: string, status: TaskStatus) {
    const task = await this.prisma.task.findFirst({ where: { id, practiceId } });
    if (!task) throw new NotFoundException('Task not found');
    return this.prisma.task.update({ where: { id }, data: { status } });
  }
}
