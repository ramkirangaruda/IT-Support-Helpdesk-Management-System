import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountStatus, RoleName } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApproveUserDto } from './dto/approve-user.dto';
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

    await this.notifications.sendAdHoc(
      target.email,
      target.name,
      'auth.account_approved',
      '[TicketZilla] Your account has been approved',
      `<p>Hi ${target.name},</p>
       <p>Great news! Your TicketZilla account has been approved. You can now log in with your email and password.</p>
       <p>Your assigned role(s): <strong>${dto.roles.join(', ')}</strong></p>`,
      `Hi ${target.name}, your TicketZilla account has been approved. You can now log in with your email and password. Roles: ${dto.roles.join(', ')}.`,
    );

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

    await this.notifications.sendAdHoc(
      target.email,
      target.name,
      'auth.account_rejected',
      '[TicketZilla] Your account registration was not approved',
      `<p>Hi ${target.name},</p>
       <p>Unfortunately, your TicketZilla account registration has not been approved at this time.</p>
       <p><strong>Reason:</strong> ${dto.reason}</p>
       <p>If you believe this is a mistake, please contact your IT department.</p>`,
      `Hi ${target.name}, your TicketZilla account registration was not approved. Reason: ${dto.reason}. Contact IT if you think this is a mistake.`,
    );

    return { message: `User ${target.email} rejected` };
  }
}
