import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { PermissionsGuard } from './auth/permissions.guard';
import { AuditModule } from './audit/audit.module';
import { AuditInterceptor } from './audit/audit.interceptor';
import { PatientsModule } from './patients/patients.module';
import { PatientHistoryModule } from './patient-history/patient-history.module';
import { InsuranceModule } from './insurance/insurance.module';
import { SchedulingModule } from './scheduling/scheduling.module';
import { EncountersModule } from './encounters/encounters.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { ReportsModule } from './reports/reports.module';
import { DocumentsModule } from './documents/documents.module';
import { OrdersModule } from './orders/orders.module';
import { InventoryModule } from './inventory/inventory.module';
import { RecallsModule } from './recalls/recalls.module';
import { OrthoKModule } from './ortho-k/ortho-k.module';
import { TasksModule } from './tasks/tasks.module';
import { AcceptedPayersModule } from './accepted-payers/accepted-payers.module';
import { UsersModule } from './users/users.module';
import { CodesModule } from './codes/codes.module';
import { PracticeModule } from './practice/practice.module';
import { PricingModule } from './pricing/pricing.module';
import { ContactLensPricingModule } from './contact-lens-pricing/contact-lens-pricing.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AuditModule,
    PatientsModule,
    PatientHistoryModule,
    InsuranceModule,
    SchedulingModule,
    EncountersModule,
    PrescriptionsModule,
    ReportsModule,
    DocumentsModule,
    OrdersModule,
    InventoryModule,
    RecallsModule,
    OrthoKModule,
    TasksModule,
    AcceptedPayersModule,
    UsersModule,
    CodesModule,
    PracticeModule,
    PricingModule,
    ContactLensPricingModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
  ],
})
export class AppModule {}
