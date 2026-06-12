import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditPayload {
  actorId?: string | null;
  entity: string;
  entityId: string;
  action: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(payload: AuditPayload): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: payload.actorId ?? null,
        entity: payload.entity,
        entityId: payload.entityId,
        action: payload.action,
        before: (payload.before ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        after: (payload.after ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      },
    });
  }
}
