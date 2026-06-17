import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DeviceRequestStatus, DeviceStatus, RoleName, UserStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AllocateDeviceDto } from './dto/allocate-device.dto';
import { CreateDeviceDto } from './dto/create-device.dto';
import { CreateDeviceRequestDto } from './dto/create-device-request.dto';
import { DecisionValue, DeviceDecisionDto } from './dto/decision.dto';
import { ReturnDeviceDto } from './dto/return-device.dto';
import { UpdateDeviceDto } from './dto/update-device.dto';


const DEVICE_INCLUDE = {
  allocations: {
    where:   { returnedOn: null },
    include: { employee: { select: { id: true, name: true, email: true } } },
  },
} as const;

const REQUEST_INCLUDE = {
  requester:  { select: { id: true, name: true, email: true } },
  manager:    { select: { id: true, name: true, email: true } },
  allocation: {
    include: {
      device:   { select: { id: true, type: true, makeModel: true, serialNumber: true } },
      employee: { select: { id: true, name: true, email: true } },
    },
  },
} as const;

const OPEN_ROLES: RoleName[] = [RoleName.IT_ADMIN, RoleName.SYS_ADMIN, RoleName.MANAGER];

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma:        PrismaService,
    private readonly audit:         AuditService,
    private readonly notifications: NotificationsService,
    private readonly eventEmitter:  EventEmitter2,
  ) {}

  // ── Device ID generation ─────────────────────────────────────────────────

  private async generateDeviceId(type: string): Promise<string> {
    const slug   = type.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 10);
    const prefix = `DEV-${slug}-`;
    const last   = await this.prisma.device.findFirst({
      where:   { id: { startsWith: prefix } },
      orderBy: { id: 'desc' },
      select:  { id: true },
    });
    const seq = last ? parseInt(last.id.slice(prefix.length), 10) : 0;
    return `${prefix}${String(seq + 1).padStart(6, '0')}`;
  }

  // ── Device CRUD ───────────────────────────────────────────────────────────

  async createDevice(dto: CreateDeviceDto, actor: AuthenticatedUser) {
    const id = await this.generateDeviceId(dto.type);

    const device = await this.prisma.device.create({
      data: {
        id,
        type:         dto.type,
        makeModel:    dto.makeModel,
        serialNumber: dto.serialNumber,
        condition:    dto.condition,
        purchasedOn:  dto.purchasedOn ? new Date(dto.purchasedOn) : null,
        cost:         dto.cost != null ? dto.cost : null,
      },
      include: DEVICE_INCLUDE,
    });

    await this.audit.log({
      actorId:  actor.id,
      entity:   'Device',
      entityId: device.id,
      action:   'CREATE',
      after:    { id: device.id, type: device.type, makeModel: device.makeModel, status: device.status },
    });

    return device;
  }

  async findAllDevices() {
    return this.prisma.device.findMany({
      include:  DEVICE_INCLUDE,
      orderBy:  { createdAt: 'desc' },
    });
  }

  async findDevice(id: string) {
    const device = await this.prisma.device.findUnique({
      where:   { id },
      include: {
        allocations: {
          include: { employee: { select: { id: true, name: true, email: true } } },
          orderBy: { allocatedOn: 'desc' },
        },
      },
    });
    if (!device) throw new NotFoundException(`Device ${id} not found`);
    return device;
  }

  async updateDevice(id: string, dto: UpdateDeviceDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.device.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`Device ${id} not found`);

    const device = await this.prisma.device.update({
      where: { id },
      data:  {
        ...(dto.makeModel    !== undefined && { makeModel:    dto.makeModel }),
        ...(dto.serialNumber !== undefined && { serialNumber: dto.serialNumber }),
        ...(dto.status       !== undefined && { status:       dto.status }),
        ...(dto.condition    !== undefined && { condition:    dto.condition }),
        ...(dto.purchasedOn  !== undefined && { purchasedOn:  new Date(dto.purchasedOn) }),
        ...(dto.cost         !== undefined && { cost:         dto.cost }),
      },
      include: DEVICE_INCLUDE,
    });

    await this.audit.log({
      actorId:  actor.id,
      entity:   'Device',
      entityId: id,
      action:   'UPDATE',
      before:   { status: existing.status },
      after:    { status: device.status },
    });

    return device;
  }

  async recordReturn(deviceId: string, dto: ReturnDeviceDto, actor: AuthenticatedUser) {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new NotFoundException(`Device ${deviceId} not found`);
    if (device.status !== DeviceStatus.ALLOCATED) {
      throw new BadRequestException('Device is not currently allocated');
    }

    const allocation = await this.prisma.deviceAllocation.findFirst({
      where:   { deviceId, returnedOn: null },
      include: { employee: { select: { id: true, name: true, email: true } } },
    });
    if (!allocation) throw new NotFoundException('No active allocation found for this device');

    const [updated] = await this.prisma.$transaction([
      this.prisma.deviceAllocation.update({
        where: { id: allocation.id },
        data:  {
          returnedOn:       new Date(),
          conditionAtReturn: dto.conditionAtReturn ?? null,
        },
        include: {
          device:   { select: { id: true, type: true, makeModel: true, serialNumber: true } },
          employee: { select: { id: true, name: true, email: true } },
        },
      }),
      this.prisma.device.update({
        where: { id: deviceId },
        data:  { status: DeviceStatus.AVAILABLE },
      }),
      // Close out the linked request if present
      ...(allocation.requestId
        ? [this.prisma.deviceRequest.update({
            where: { id: allocation.requestId },
            data:  { status: DeviceRequestStatus.RETURNED },
          })]
        : []),
    ]);

    await this.audit.log({
      actorId:  actor.id,
      entity:   'DeviceAllocation',
      entityId: allocation.id,
      action:   'RETURN',
      before:   { deviceStatus: DeviceStatus.ALLOCATED },
      after:    { deviceStatus: DeviceStatus.AVAILABLE, returnedOn: new Date().toISOString() },
    });

    // Resolve outstanding reminders if employee is now within limit
    const [maxCfg, remaining] = await Promise.all([
      this.prisma.systemConfig.findUnique({ where: { key: 'MAX_DEVICES_PER_EMPLOYEE' } }),
      this.prisma.deviceAllocation.count({
        where: { employeeId: allocation.employeeId, returnedOn: null },
      }),
    ]);
    const maxDevices = maxCfg ? parseInt(maxCfg.value, 10) : 2;
    if (remaining <= maxDevices) {
      await this.prisma.deviceReminder.updateMany({
        where: { employeeId: allocation.employeeId, resolved: false },
        data:  { resolved: true },
      });
    }

    return updated;
  }

  // ── Employee devices ──────────────────────────────────────────────────────

  async getEmployeeDevices(employeeId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: employeeId } });
    if (!user) throw new NotFoundException(`User ${employeeId} not found`);

    return this.prisma.deviceAllocation.findMany({
      where:   { employeeId, returnedOn: null },
      include: {
        device: { select: { id: true, type: true, makeModel: true, serialNumber: true, status: true } },
      },
      orderBy: { allocatedOn: 'desc' },
    });
  }

  // ── Overdue employees (dashboard) ────────────────────────────────────────

  async getOverdueEmployees() {
    const maxCfg = await this.prisma.systemConfig.findUnique({
      where: { key: 'MAX_DEVICES_PER_EMPLOYEE' },
    });
    const maxDevices = maxCfg ? parseInt(maxCfg.value, 10) : 2;

    // Employees holding more than the limit
    const raw = await this.prisma.$queryRaw<{
      id: string; name: string; email: string; holdCount: bigint;
    }[]>`
      SELECT u.id, u.name, u.email, COUNT(da.id) AS "holdCount"
      FROM "User"      u
      JOIN "UserRole"  ur ON u.id = ur."userId"
      JOIN "Role"      r  ON ur."roleId" = r.id AND r.name = 'EMPLOYEE'
      JOIN "DeviceAllocation" da ON da."employeeId" = u.id AND da."returnedOn" IS NULL
      WHERE u.status = 'ACTIVE'
      GROUP BY u.id, u.name, u.email
      HAVING COUNT(da.id) > ${maxDevices}
      ORDER BY COUNT(da.id) DESC
    `;

    if (raw.length === 0) return { maxDevices, employees: [] };

    // Load last reminder for each employee
    const employeeIds = raw.map(r => r.id);
    const lastReminders = await this.prisma.deviceReminder.findMany({
      where: { employeeId: { in: employeeIds } },
      orderBy: { sentAt: 'desc' },
      distinct: ['employeeId'],
    });
    const reminderByEmployee = Object.fromEntries(
      lastReminders.map(r => [r.employeeId, r]),
    );

    return {
      maxDevices,
      employees: raw.map(r => ({
        id:                r.id,
        name:              r.name,
        email:             r.email,
        holdCount:         Number(r.holdCount),
        lastReminderAt:    reminderByEmployee[r.id]?.sentAt?.toISOString() ?? null,
        lastReminderCycle: reminderByEmployee[r.id]?.cycle ?? null,
      })),
    };
  }

  // ── Device requests ───────────────────────────────────────────────────────

  async createRequest(dto: CreateDeviceRequestDto, actor: AuthenticatedUser) {
    const request = await this.prisma.deviceRequest.create({
      data: {
        requesterId:   actor.id,
        deviceType:    dto.deviceType,
        justification: dto.justification,
      },
      include: REQUEST_INCLUDE,
    });

    await this.audit.log({
      actorId:  actor.id,
      entity:   'DeviceRequest',
      entityId: request.id,
      action:   'CREATE',
      after:    { deviceType: request.deviceType, status: request.status },
    });

    return request;
  }

  async listRequests(actor: AuthenticatedUser, status?: DeviceRequestStatus) {
    const isAdmin   = actor.roles.some(r => (r as RoleName) === RoleName.IT_ADMIN || (r as RoleName) === RoleName.SYS_ADMIN);
    const isManager = actor.roles.includes(RoleName.MANAGER);

    let where: Record<string, unknown>;
    if (isAdmin) {
      where = status ? { status } : {};
    } else if (isManager) {
      // Managers only see requests pending their approval
      where = { status: status ?? DeviceRequestStatus.PENDING_MANAGER_APPROVAL };
    } else {
      where = { requesterId: actor.id, ...(status && { status }) };
    }

    return this.prisma.deviceRequest.findMany({
      where,
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getRequest(id: string, actor: AuthenticatedUser) {
    const request = await this.prisma.deviceRequest.findUnique({
      where:   { id },
      include: REQUEST_INCLUDE,
    });
    if (!request) throw new NotFoundException(`DeviceRequest ${id} not found`);

    const isAdmin = actor.roles.some(r => OPEN_ROLES.includes(r));
    if (!isAdmin && request.requesterId !== actor.id) throw new ForbiddenException();

    return request;
  }

  async makeDecision(id: string, dto: DeviceDecisionDto, actor: AuthenticatedUser) {
    const request = await this.prisma.deviceRequest.findUnique({
      where:   { id },
      include: {
        requester: { select: { id: true, name: true, email: true, managerId: true } },
      },
    });
    if (!request) throw new NotFoundException(`DeviceRequest ${id} not found`);

    const allowedStatuses: DeviceRequestStatus[] = [
      DeviceRequestStatus.SUBMITTED,
      DeviceRequestStatus.PENDING_MANAGER_APPROVAL,
    ];
    if (!allowedStatuses.includes(request.status)) {
      throw new BadRequestException(`Cannot decide on a request with status ${request.status}`);
    }

    // §B — if the requester has a managerId set, only that specific manager may approve.
    // IT_ADMIN/SYS_ADMIN bypass this check so fulfilment is never blocked by missing org-chart data.
    const isAdmin = actor.roles.some(r => r === RoleName.IT_ADMIN || r === RoleName.SYS_ADMIN);
    const hasManagerRole = actor.roles.includes(RoleName.MANAGER);
    if (hasManagerRole && !isAdmin) {
      const requesterManagerId = (request.requester as { managerId?: string | null }).managerId;
      if (requesterManagerId && requesterManagerId !== actor.id) {
        throw new ForbiddenException(
          'You are not the reporting manager for the requester of this device request',
        );
      }
    }

    const newStatus = dto.decision === DecisionValue.APPROVED
      ? DeviceRequestStatus.PENDING_FULFILMENT
      : DeviceRequestStatus.REJECTED;

    const updated = await this.prisma.deviceRequest.update({
      where: { id },
      data:  {
        status:    newStatus,
        managerId: actor.id,
        decidedAt: new Date(),
      },
      include: REQUEST_INCLUDE,
    });

    await this.audit.log({
      actorId:  actor.id,
      entity:   'DeviceRequest',
      entityId: id,
      action:   dto.decision,
      before:   { status: request.status },
      after:    { status: newStatus, decidedAt: new Date().toISOString() },
    });

    // Notify requester
    await this.notifyDecision(request.requester.email, dto.decision);

    // Notify IT_ADMINs on approval so they can fulfil
    if (dto.decision === DecisionValue.APPROVED) {
      const admins = await this.prisma.user.findMany({
        where: {
          userRoles: { some: { role: { name: RoleName.IT_ADMIN } } },
          status:    UserStatus.ACTIVE,
        },
        select: { email: true, name: true },
      });
      for (const admin of admins) {
        await this.notifyApprovedAdmin(admin.email);
      }

      // Trigger auto-create of PurchaseRequest if no AVAILABLE stock of this type
      this.eventEmitter.emit('device.request.approved', {
        deviceRequestId: id,
        deviceType:      request.deviceType,
        actorId:         actor.id,
      });
    }

    return updated;
  }

  async allocate(requestId: string, dto: AllocateDeviceDto, actor: AuthenticatedUser) {
    const request = await this.prisma.deviceRequest.findUnique({
      where:   { id: requestId },
      include: { requester: { select: { id: true, name: true, email: true } } },
    });
    if (!request) throw new NotFoundException(`DeviceRequest ${requestId} not found`);

    if (request.status !== DeviceRequestStatus.PENDING_FULFILMENT) {
      throw new BadRequestException(
        `Request must be in PENDING_FULFILMENT status to allocate (current: ${request.status})`,
      );
    }

    const device = await this.prisma.device.findUnique({ where: { id: dto.deviceId } });
    if (!device) throw new NotFoundException(`Device ${dto.deviceId} not found`);
    if (device.status !== DeviceStatus.AVAILABLE) {
      throw new BadRequestException(`Device ${dto.deviceId} is not AVAILABLE (current: ${device.status})`);
    }

    // Interactive transaction with an atomic device claim. updateMany with a
    // status=AVAILABLE guard is serialized at the row level by Postgres, so two
    // concurrent allocations cannot both succeed: the loser sees count===0.
    const allocation = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.device.updateMany({
        where: { id: dto.deviceId, status: DeviceStatus.AVAILABLE },
        data:  { status: DeviceStatus.ALLOCATED },
      });
      if (claimed.count === 0) {
        throw new BadRequestException(
          `Device ${dto.deviceId} was just allocated by another request — please pick another device`,
        );
      }

      const created = await tx.deviceAllocation.create({
        data: {
          deviceId:        dto.deviceId,
          employeeId:      request.requesterId,
          requestId:       requestId,
          allocatedOn:     new Date(),
          expectedReturn:  dto.expectedReturn ? new Date(dto.expectedReturn) : null,
          conditionAtIssue: dto.conditionAtIssue,
        },
        include: {
          device:   { select: { id: true, type: true, makeModel: true, serialNumber: true } },
          employee: { select: { id: true, name: true, email: true } },
        },
      });

      await tx.deviceRequest.update({
        where: { id: requestId },
        data:  { status: DeviceRequestStatus.ALLOCATED },
      });

      return created;
    });

    await this.audit.log({
      actorId:  actor.id,
      entity:   'DeviceAllocation',
      entityId: allocation.id,
      action:   'ALLOCATE',
      after:    {
        deviceId:  dto.deviceId,
        employeeId: request.requesterId,
        requestId,
        allocatedOn: new Date().toISOString(),
      },
    });

    return allocation;
  }

  // ── Notification helpers ──────────────────────────────────────────────────

  private async notifyDecision(
    toEmail:  string,
    decision: DecisionValue,
  ) {
    await this.notifications.sendAdHoc(
      toEmail, `device.request.${decision.toLowerCase()}`,
    );
  }

  private async notifyApprovedAdmin(toEmail: string) {
    await this.notifications.sendAdHoc(toEmail, 'device.request.pending_fulfilment');
  }
}
