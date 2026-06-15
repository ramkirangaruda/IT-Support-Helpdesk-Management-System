import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { RoleName } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { ReportsService } from './reports.service';

const ADMIN_ROLES   = [RoleName.IT_ADMIN, RoleName.SYS_ADMIN];
const MANAGER_ROLES = [...ADMIN_ROLES, RoleName.MANAGER];

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  // GET /reports/dashboard — IT_ADMIN, SYS_ADMIN, MANAGER
  @Get('dashboard')
  @Roles(...MANAGER_ROLES)
  getDashboard() {
    return this.reportsService.getDashboard();
  }

  // GET /reports/tickets — IT_ADMIN, SYS_ADMIN
  @Get('tickets')
  @Roles(...ADMIN_ROLES)
  getTickets(
    @Query('from')      from?: string,
    @Query('to')        to?: string,
    @Query('category')  category?: string,
    @Query('priority')  priority?: string,
    @Query('agentId')   agentId?: string,
    @Query('open')      open?: string,
    @Query('page')      page?: string,
    @Query('limit')     limit?: string,
  ) {
    return this.reportsService.getTickets({
      from, to, category, priority, agentId,
      open:  open === 'true',
      page:  page  ? parseInt(page,  10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  // GET /reports/export — IT_ADMIN, SYS_ADMIN; streams CSV
  @Get('export')
  @Roles(...ADMIN_ROLES)
  async exportCsv(
    @Query('from') from: string | undefined,
    @Query('to')   to:   string | undefined,
    @Res()         res:  Response,
  ) {
    const csv = await this.reportsService.exportCsv({ from, to });
    const ts  = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tickets-${ts}.csv"`);
    res.send(csv);
  }
}
