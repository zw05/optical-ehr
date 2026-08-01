import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';
import { TasksService } from './tasks.service';

class CreateTaskDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  detail?: string;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsUUID()
  patientId?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

class SetTaskStatusDto {
  @IsEnum(TaskStatus)
  status!: TaskStatus;
}

/** Internal practice to-do items (callbacks, order follow-ups, …). */
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  /** POST /api/tasks — create a task, optionally linked to a patient. */
  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateTaskDto) {
    return this.tasks.create(user.practiceId, {
      title: dto.title,
      detail: dto.detail,
      assigneeId: dto.assigneeId,
      patientId: dto.patientId,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
    });
  }

  /** GET /api/tasks?status=&assigneeId= — task board. */
  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: TaskStatus,
    @Query('assigneeId') assigneeId?: string,
  ) {
    return this.tasks.list(user.practiceId, { status, assigneeId });
  }

  /** PATCH /api/tasks/:id/status — OPEN → IN_PROGRESS → DONE. */
  @Patch(':id/status')
  setStatus(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: SetTaskStatusDto) {
    return this.tasks.setStatus(user.practiceId, id, dto.status);
  }
}
