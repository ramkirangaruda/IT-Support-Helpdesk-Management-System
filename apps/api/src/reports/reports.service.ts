import { Injectable } from '@nestjs/common';
import { Prisma, Priority, TicketStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const CLOSED_STATUSES = [TicketStatus.RESOLVED, TicketStatus.CLOSED, TicketStatus.CANCELLED];

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard() {
    const [
      byStatusRaw,
      byPriorityRaw,
      slaBreached,
      slaAtRiskRaw,
      avgResRaw,
      last30Raw,
      reopenRaw,
      topCatsRaw,
      agentWorkloadRaw,
    ] = await Promise.all([
      this.prisma.ticket.groupBy({
        by: ['status'],
        where: { status: { notIn: CLOSED_STATUSES } },
        _count: { _all: true },
      }),
      this.prisma.ticket.groupBy({
        by: ['priority'],
        where: { status: { notIn: CLOSED_STATUSES } },
        _count: { _all: true },
      }),
      this.prisma.ticket.count({
        where: {
          status: { notIn: CLOSED_STATUSES },
          slaResolutionDue: { lt: new Date() },
        },
      }),
      this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT COUNT(*) AS count FROM "Ticket"
        WHERE status NOT IN ('RESOLVED', 'CLOSED', 'CANCELLED')
        AND "slaResolutionDue" IS NOT NULL
        AND "slaResolutionDue" > NOW()
        AND EXTRACT(EPOCH FROM ("slaResolutionDue" - NOW()))
            < 0.25 * EXTRACT(EPOCH FROM ("slaResolutionDue" - "createdAt"))
      `,
      this.prisma.$queryRaw<[{ avg: number | null }]>`
        SELECT AVG(EXTRACT(EPOCH FROM ("resolvedAt" - "createdAt")) / 3600) AS avg
        FROM "Ticket"
        WHERE "resolvedAt" IS NOT NULL
        AND "resolvedAt" >= NOW() - INTERVAL '30 days'
      `,
      this.prisma.$queryRaw<[{ escalated: bigint; total: bigint }]>`
        SELECT
          COUNT(*) FILTER (WHERE "escalationLevel" > 0) AS escalated,
          COUNT(*)                                       AS total
        FROM "Ticket"
        WHERE "createdAt" >= NOW() - INTERVAL '30 days'
      `,
      this.prisma.$queryRaw<[{ reopened: bigint; total: bigint }]>`
        SELECT
          (SELECT COUNT(DISTINCT "ticketId") FROM "StatusHistory"
           WHERE "toStatus" = 'REOPENED'
           AND "createdAt" >= NOW() - INTERVAL '30 days') AS reopened,
          (SELECT COUNT(*) FROM "Ticket"
           WHERE "createdAt" >= NOW() - INTERVAL '30 days') AS total
      `,
      this.prisma.$queryRaw<{ name: string; count: bigint }[]>`
        SELECT c.name, COUNT(t.id) AS count
        FROM "Ticket" t
        JOIN "Category" c ON t."categoryId" = c.id
        WHERE t.status NOT IN ('RESOLVED', 'CLOSED', 'CANCELLED')
        GROUP BY c.id, c.name
        ORDER BY count DESC
        LIMIT 5
      `,
      this.prisma.$queryRaw<{ agentName: string; open: bigint; resolved_today: bigint }[]>`
        SELECT
          u.name AS "agentName",
          COUNT(t.id) FILTER (
            WHERE t.status NOT IN ('RESOLVED', 'CLOSED', 'CANCELLED')
          ) AS open,
          COUNT(t.id) FILTER (
            WHERE t.status IN ('RESOLVED', 'CLOSED')
            AND t."resolvedAt" >= CURRENT_DATE::timestamp
            AND t."resolvedAt" <  (CURRENT_DATE + 1)::timestamp
          ) AS resolved_today
        FROM "User" u
        INNER JOIN "UserRole" ur ON u.id = ur."userId"
        INNER JOIN "Role"     r  ON ur."roleId" = r.id AND r.name = 'AGENT'
        LEFT  JOIN "Ticket"   t  ON t."assigneeId" = u.id
        GROUP BY u.id, u.name
        ORDER BY open DESC
      `,
    ]);

    const openByStatus: Record<string, number> = {
      NEW: 0, ASSIGNED: 0, IN_PROGRESS: 0, ON_HOLD: 0, ESCALATED: 0,
    };
    for (const row of byStatusRaw) {
      if (row.status in openByStatus) openByStatus[row.status] = row._count._all;
    }

    const openByPriority: Record<string, number> = {
      CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0,
    };
    for (const row of byPriorityRaw) {
      openByPriority[row.priority] = row._count._all;
    }

    const total30   = Number(last30Raw[0].total);
    const reopenTotal = Number(reopenRaw[0].total);

    return {
      openByStatus,
      openByPriority,
      slaBreached,
      slaAtRisk:         Number(slaAtRiskRaw[0].count),
      avgResolutionHours: avgResRaw[0].avg != null
        ? Math.round(avgResRaw[0].avg * 10) / 10
        : 0,
      escalationRate: total30 > 0
        ? Math.round((Number(last30Raw[0].escalated) / total30) * 1000) / 10
        : 0,
      reopenRate: reopenTotal > 0
        ? Math.round((Number(reopenRaw[0].reopened) / reopenTotal) * 1000) / 10
        : 0,
      topCategories:  topCatsRaw.map(r => ({ name: r.name, count: Number(r.count) })),
      agentWorkload:  agentWorkloadRaw.map(r => ({
        agentName:     r.agentName,
        open:          Number(r.open),
        resolved_today: Number(r.resolved_today),
      })),
    };
  }

  async getTickets(params: {
    from?: string;
    to?: string;
    category?: string;
    priority?: string;
    agentId?: string;
    open?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { from, to, category, priority, agentId, open, page = 1, limit = 50 } = params;

    const where: Prisma.TicketWhereInput = {};

    if (open) where.status = { notIn: CLOSED_STATUSES };

    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(from);
      if (to)   (where.createdAt as Prisma.DateTimeFilter).lte = new Date(to);
    }
    if (category) where.categoryId = category;
    if (priority) where.priority   = priority as Priority;
    if (agentId)  where.assigneeId = agentId;

    const [data, total] = await Promise.all([
      this.prisma.ticket.findMany({
        where,
        include: {
          requester: { select: { id: true, name: true, email: true } },
          assignee:  { select: { id: true, name: true, email: true } },
          category:  { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip:  (page - 1) * limit,
        take:  limit,
      }),
      this.prisma.ticket.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async exportCsv(params: { from?: string; to?: string }): Promise<string> {
    const { from, to } = params;

    const where: Prisma.TicketWhereInput = {};
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(from);
      if (to)   (where.createdAt as Prisma.DateTimeFilter).lte = new Date(to);
    }

    const tickets = await this.prisma.ticket.findMany({
      where,
      include: {
        requester: { select: { name: true } },
        assignee:  { select: { name: true } },
        category:  { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    function cell(v: string | number | boolean | null | undefined): string {
      if (v === null || v === undefined) return '';
      const s = String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    }

    const headers = [
      'Ticket ID', 'Subject', 'Category', 'Priority', 'Status',
      'Requester', 'Assignee', 'Created', 'Resolved', 'Resolution Hours', 'Escalated',
    ];

    const rows = tickets.map(t => {
      const resHours = t.resolvedAt
        ? Math.round((t.resolvedAt.getTime() - t.createdAt.getTime()) / 36_000) / 100
        : '';
      return [
        t.id,
        t.subject,
        t.category?.name ?? '',
        t.priority,
        t.status,
        t.requester.name,
        t.assignee?.name ?? '',
        t.createdAt.toISOString(),
        t.resolvedAt?.toISOString() ?? '',
        resHours,
        t.escalationLevel > 0 ? 'Yes' : 'No',
      ].map(cell).join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }
}
