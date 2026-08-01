import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Single shared database client for the whole API (exported by the global
 * PrismaModule). Services inject this to run queries and transactions.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  /** Opens the connection pool when the application starts. */
  async onModuleInit() {
    await this.$connect();
  }

  /** Closes the connection pool cleanly on shutdown. */
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
