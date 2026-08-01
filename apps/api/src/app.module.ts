import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { AuditModule } from './audit/audit.module';
import { AuditInterceptor } from './audit/audit.interceptor';
import { PatientsModule } from './patients/patients.module';
import { InsuranceModule } from './insurance/insurance.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { EncountersModule } from './encounters/encounters.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { ReportsModule } from './reports/reports.module';
import { DocumentsModule } from './documents/documents.module';
import { OrdersModule } from './orders/orders.module';
import { InventoryModule } from './inventory/inventory.module';
import { RecallsModule } from './recalls/recalls.module';
import { TasksModule } from './tasks/tasks.module';
import { AcceptedPayersModule } from './accepted-payers/accepted-payers.module';
import { UsersModule } from './users/users.module';

/**
 * Root module: registers every feature module and applies global JWT auth,
 * role checks, and PHI audit logging to all routes.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AuditModule,
    PatientsModule,
    InsuranceModule,
    SchedulingModule,
    EncountersModule,
    PrescriptionsModule,
    ReportsModule,
    DocumentsModule,
    OrdersModule,
    InventoryModule,
    RecallsModule,
    TasksModule,
    AcceptedPayersModule,
    UsersModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
