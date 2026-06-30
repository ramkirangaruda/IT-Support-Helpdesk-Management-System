import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountStatus, RoleName, UserStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApproveUserDto } from './dto/approve-user.dto';
import { AssignRoleDto, ListAllUsersDto } from './dto/assign-role.dto';
import { RejectUserDto } from './dto/reject-user.dto';

// Fields returned from pending-user queries — passwordHash excluded
const PENDING_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  department: true,
  accountStatus: true,
  createdAt: true,
} as const;

// Richer shape for the full user-management table — passwordHash excluded
const MANAGE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  department: true,
  accountStatus: true,
  status: true,
  createdAt: true,
  userRoles: { select: { role: { select: { name: true } } } },
} as const;

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  listPending() {
    return this.prisma.user.findMany({
      where: { accountStatus: AccountStatus.PENDING_APPROVAL },
      select: PENDING_USER_SELECT,
      orderBy: { createdAt: 'asc' },
    });
  }

  async approve(
    targetId: string,
    dto: ApproveUserDto,
    actorId: string,
  ): Promise<{ message: string }> {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { ...PENDING_USER_SELECT, accountStatus: true },
    });

    if (!target) throw new NotFoundException('User not found');
    if (target.accountStatus !== AccountStatus.PENDING_APPROVAL) {
      throw new BadRequestException('User is not in PENDING_APPROVAL state');
    }

    // Resolve role records
    const roles = await this.prisma.role.findMany({
      where: { name: { in: dto.roles } },
      select: { id: true, name: true },
    });
    if (roles.length !== dto.roles.length) {
      throw new BadRequestException('One or more roles are invalid');
    }

    // Activate account + assign roles in one transaction
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: targetId },
        data: {
          accountStatus: AccountStatus.ACTIVE,
          approvedById: actorId,
          approvedAt: new Date(),
        },
      }),
      // Clear any existing roles first, then assign the approved roles
      this.prisma.userRole.deleteMany({ where: { userId: targetId } }),
      this.prisma.userRole.createMany({
        data: roles.map((r) => ({ userId: targetId, roleId: r.id })),
      }),
    ]);

    await this.audit.log({
      actorId,
      entity: 'User',
      entityId: targetId,
      action: 'APPROVE_USER',
      before: { accountStatus: AccountStatus.PENDING_APPROVAL },
      after: {
        accountStatus: AccountStatus.ACTIVE,
        roles: dto.roles,
      },
    });

    await this.notifications.sendAdHoc(target.email, 'auth.account_approved');

    return { message: `User ${target.email} approved with roles: ${dto.roles.join(', ')}` };
  }

  async reject(
    targetId: string,
    dto: RejectUserDto,
    actorId: string,
  ): Promise<{ message: string }> {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { ...PENDING_USER_SELECT, accountStatus: true },
    });

    if (!target) throw new NotFoundException('User not found');
    if (target.accountStatus !== AccountStatus.PENDING_APPROVAL) {
      throw new BadRequestException('User is not in PENDING_APPROVAL state');
    }

    await this.prisma.user.update({
      where: { id: targetId },
      data: { accountStatus: AccountStatus.REJECTED },
    });

    await this.audit.log({
      actorId,
      entity: 'User',
      entityId: targetId,
      action: 'REJECT_USER',
      before: { accountStatus: AccountStatus.PENDING_APPROVAL },
      after: { accountStatus: AccountStatus.REJECTED, reason: dto.reason },
    });

    await this.notifications.sendAdHoc(target.email, 'auth.account_rejected');

    return { message: `User ${target.email} rejected` };
  }

  // ── Full user management (all users, not just pending) ─────────────────────

  /** Flatten userRoles → roles[] for the management table. */
  private toManageView(u: {
    id: string; name: string; email: string; department: string | null;
    accountStatus: AccountStatus; status: UserStatus; createdAt: Date;
    userRoles: { role: { name: RoleName } }[];
  }) {
    const { userRoles, ...rest } = u;
    return { ...rest, roles: userRoles.map((ur) => ur.role.name) };
  }

  async listAll(filters: ListAllUsersDto = {}) {
    const users = await this.prisma.user.findMany({
      where: {
        ...(filters.accountStatus && { accountStatus: filters.accountStatus }),
        ...(filters.role && { userRoles: { some: { role: { name: filters.role } } } }),
      },
      select: MANAGE_USER_SELECT,
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => this.toManageView(u));
  }

  async assignRole(
    targetId: string,
    dto: AssignRoleDto,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    if (targetId === actor.id) {
      throw new ForbiddenException('You cannot change your own role');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { ...MANAGE_USER_SELECT, accountStatus: true },
    });
    if (!target) throw new NotFoundException('User not found');

    const callerIsSysAdmin = actor.roles.includes(RoleName.SYS_ADMIN);
    const targetIsSysAdmin = target.userRoles.some((ur) => ur.role.name === RoleName.SYS_ADMIN);

    // Only a SYS_ADMIN can grant SYS_ADMIN…
    if (dto.role === RoleName.SYS_ADMIN && !callerIsSysAdmin) {
      throw new ForbiddenException('Only a SYS_ADMIN can grant the SYS_ADMIN role');
    }
    // …or change/demote an existing SYS_ADMIN.
    if (targetIsSysAdmin && !callerIsSysAdmin) {
      throw new ForbiddenException('Only a SYS_ADMIN can change another SYS_ADMIN');
    }

    const role = await this.prisma.role.findUnique({
      where: { name: dto.role },
      select: { id: true, name: true },
    });
    if (!role) throw new BadRequestException('Invalid role');

    // Assigning a role to a still-pending user activates the account (register → pending →
    // admin assigns role → user can access). Active users just get their role replaced.
    const wasPending = target.accountStatus === AccountStatus.PENDING_APPROVAL;
    const userUpdate = wasPending
      ? { accountStatus: AccountStatus.ACTIVE, approvedById: actor.id, approvedAt: new Date() }
      : {};

    await this.prisma.$transaction([
      this.prisma.userRole.deleteMany({ where: { userId: targetId } }),
      this.prisma.userRole.create({ data: { userId: targetId, roleId: role.id } }),
      this.prisma.user.update({ where: { id: targetId }, data: userUpdate }),
    ]);

    await this.audit.log({
      actorId: actor.id,
      entity: 'User',
      entityId: targetId,
      action: 'ASSIGN_ROLE',
      before: { roles: target.userRoles.map((ur) => ur.role.name), accountStatus: target.accountStatus },
      after: { roles: [dto.role], accountStatus: wasPending ? AccountStatus.ACTIVE : target.accountStatus },
    });

    if (wasPending) {
      await this.notifications.sendAdHoc(target.email, 'auth.account_approved');
    }

    return { message: `${target.email} is now ${dto.role}` };
  }

  async deactivate(
    targetId: string,
    actor: AuthenticatedUser,
  ): Promise<{ message: string }> {
    if (targetId === actor.id) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, email: true, status: true },
    });
    if (!target) throw new NotFoundException('User not found');

    await this.prisma.user.update({
      where: { id: targetId },
      data: { status: UserStatus.INACTIVE },
    });

    await this.audit.log({
      actorId: actor.id,
      entity: 'User',
      entityId: targetId,
      action: 'DEACTIVATE_USER',
      before: { status: target.status },
      after: { status: UserStatus.INACTIVE },
    });

    return { message: `${target.email} deactivated` };
  }
}
