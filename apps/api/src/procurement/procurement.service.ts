import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  ApprovalDecision,
  DeviceStatus,
  PurchaseRequestStatus,
  RoleName,
  UserStatus,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { ApprovePrDecision, ApprovePrDto } from './dto/approve-pr.dto';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { RecordPoDto } from './dto/record-po.dto';
import { RecordReceiptDto } from './dto/record-receipt.dto';
import { UpdatePurchaseRequestDto } from './dto/update-purchase-request.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

const PR_INCLUDE = {
  raisedBy:      { select: { id: true, name: true, email: true } },
  deviceRequest: {
    select: {
      id:           true,
      deviceType:   true,
      justification: true,
      status:        true,
      requester:     { select: { id: true, name: true, email: true } },
    },
  },
  vendor: { select: { id: true, name: true, category: true, leadTimeDays: true } },
} as const;

// Statuses that block further approval transitions
const TERMINAL_STATUSES: PurchaseRequestStatus[] = [
  PurchaseRequestStatus.REJECTED,
  PurchaseRequestStatus.RECEIVED,
];

@Injectable()
export class ProcurementService {
  private readonly logger = new Logger(ProcurementService.name);

  constructor(
    private readonly prisma:        PrismaService,
    private readonly audit:         AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── ID generation ─────────────────────────────────────────────────────────

  private async generatePrId(): Promise<string> {
    const year   = new Date().getFullYear();
    const prefix = `PR-${year}-`;
    const last   = await this.prisma.purchaseRequest.findFirst({
      where:   { id: { startsWith: prefix } },
      orderBy: { id: 'desc' },
      select:  { id: true },
    });
    const seq = last ? parseInt(last.id.slice(prefix.length), 10) : 0;
    return `${prefix}${String(seq + 1).padStart(4, '0')}`;
  }

  // Device ID generation mirrors DevicesService; duplicated to avoid circular dep
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

  // ── Vendor CRUD ───────────────────────────────────────────────────────────

  async createVendor(dto: CreateVendorDto) {
    return this.prisma.vendor.create({ data: dto });
  }

  async listVendors() {
    return this.prisma.vendor.findMany({ orderBy: { name: 'asc' } });
  }

  async updateVendor(id: string, dto: UpdateVendorDto) {
    const v = await this.prisma.vendor.findUnique({ where: { id } });
    if (!v) throw new NotFoundException(`Vendor ${id} not found`);
    return this.prisma.vendor.update({ where: { id }, data: dto });
  }

  // ── Purchase Request CRUD ─────────────────────────────────────────────────

  async create(dto: CreatePurchaseRequestDto, actor: AuthenticatedUser) {
    const id = await this.generatePrId();

    const pr = await this.prisma.purchaseRequest.create({
      data: {
        id,
        raisedById:      actor.id,
        deviceRequestId: dto.deviceRequestId ?? null,
        itemSpec:        dto.itemSpec,
        quantity:        dto.quantity,
        estCost:         dto.estCost,
        budgetCode:      dto.budgetCode,
        status:          PurchaseRequestStatus.PENDING_MANAGER_APPROVAL,
      },
      include: PR_INCLUDE,
    });

    await this.audit.log({
      actorId:  actor.id,
      entity:   'PurchaseRequest',
      entityId: id,
      action:   'CREATE',
      after:    { itemSpec: pr.itemSpec, status: pr.status },
    });

    // Notify managers immediately on creation
    await this.notifyManagers(pr.id, pr.itemSpec, pr.raisedBy.name);

    return pr;
  }

  async list(actor: AuthenticatedUser) {
    const hasRole = (r: RoleName) => actor.roles.includes(r);

    let where: Record<string, unknown> = {};
    if (hasRole(RoleName.IT_ADMIN) || hasRole(RoleName.SYS_ADMIN)) {
      where = {};
    } else if (hasRole(RoleName.MANAGER)) {
      where = { status: PurchaseRequestStatus.PENDING_MANAGER_APPROVAL };
    } else if (hasRole(RoleName.FINANCE)) {
      where = { status: PurchaseRequestStatus.PENDING_FINANCE_APPROVAL };
    } else {
      where = { raisedById: actor.id };
    }

    return this.prisma.purchaseRequest.findMany({
      where,
      include: PR_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOne(id: string, actor: AuthenticatedUser) {
    const pr = await this.prisma.purchaseRequest.findUnique({
      where:   { id },
      include: PR_INCLUDE,
    });
    if (!pr) throw new NotFoundException(`PurchaseRequest ${id} not found`);

    const hasRole = (r: RoleName) => actor.roles.includes(r);
    const isPrivileged = hasRole(RoleName.IT_ADMIN) || hasRole(RoleName.SYS_ADMIN)
      || hasRole(RoleName.MANAGER) || hasRole(RoleName.FINANCE);
    if (!isPrivileged && pr.raisedById !== actor.id) throw new ForbiddenException();

    const approvalSteps = await this.prisma.approvalStep.findMany({
      where:   { parentType: 'PurchaseRequest', parentId: id },
      include: { approver: { select: { id: true, name: true, email: true } } },
      orderBy: { decidedAt: 'asc' },
    });

    return { ...pr, approvalSteps };
  }

  // ── Draft edit + submit (RAISED PRs) ──────────────────────────────────────
  // Auto-created PRs land in RAISED with placeholder cost/budget. An admin
  // fills in the real values here, then submits into the approval chain.

  async update(id: string, dto: UpdatePurchaseRequestDto, actor: AuthenticatedUser) {
    const pr = await this.prisma.purchaseRequest.findUnique({ where: { id } });
    if (!pr) throw new NotFoundException(`PurchaseRequest ${id} not found`);
    if (pr.status !== PurchaseRequestStatus.RAISED) {
      throw new BadRequestException(
        `Only RAISED (draft) purchase requests can be edited (current: ${pr.status})`,
      );
    }

    const updated = await this.prisma.purchaseRequest.update({
      where: { id },
      data: {
        ...(dto.itemSpec   !== undefined && { itemSpec:   dto.itemSpec }),
        ...(dto.quantity   !== undefined && { quantity:   dto.quantity }),
        ...(dto.estCost    !== undefined && { estCost:    dto.estCost }),
        ...(dto.budgetCode !== undefined && { budgetCode: dto.budgetCode }),
      },
      include: PR_INCLUDE,
    });

    await this.audit.log({
      actorId:  actor.id,
      entity:   'PurchaseRequest',
      entityId: id,
      action:   'UPDATE',
      before:   { itemSpec: pr.itemSpec, estCost: pr.estCost?.toString(), budgetCode: pr.budgetCode },
      after:    { itemSpec: updated.itemSpec, estCost: updated.estCost?.toString(), budgetCode: updated.budgetCode },
    });

    return updated;
  }

  async submit(id: string, actor: AuthenticatedUser) {
    const pr = await this.prisma.purchaseRequest.findUnique({
      where:   { id },
      include: PR_INCLUDE,
    });
    if (!pr) throw new NotFoundException(`PurchaseRequest ${id} not found`);
    if (pr.status !== PurchaseRequestStatus.RAISED) {
      throw new BadRequestException(
        `Only RAISED (draft) purchase requests can be submitted (current: ${pr.status})`,
      );
    }
    if (pr.budgetCode === 'TBD' || Number(pr.estCost) <= 0) {
      throw new BadRequestException(
        'Set a real budget code and estimated cost before submitting for approval',
      );
    }

    const updated = await this.prisma.purchaseRequest.update({
      where:   { id },
      data:    { status: PurchaseRequestStatus.PENDING_MANAGER_APPROVAL },
      include: PR_INCLUDE,
    });

    await this.audit.log({
      actorId:  actor.id,
      entity:   'PurchaseRequest',
      entityId: id,
      action:   'SUBMIT',
      before:   { status: PurchaseRequestStatus.RAISED },
      after:    { status: PurchaseRequestStatus.PENDING_MANAGER_APPROVAL },
    });

    await this.notifyManagers(pr.id, pr.itemSpec, pr.raisedBy.name);

    return updated;
  }

  // ── Approval flow ─────────────────────────────────────────────────────────

  async approve(id: string, dto: ApprovePrDto, actor: AuthenticatedUser) {
    const pr = await this.prisma.purchaseRequest.findUnique({
      where:   { id },
      include: PR_INCLUDE,
    });
    if (!pr) throw new NotFoundException(`PurchaseRequest ${id} not found`);

    if (TERMINAL_STATUSES.includes(pr.status)) {
      throw new BadRequestException(`Cannot approve a ${pr.status} request`);
    }

    const hasRole = (r: RoleName) => actor.roles.includes(r);
    // §B — IT_ADMIN removed from approve stages: they raise/submit PRs so must not also approve them.
    // SYS_ADMIN retains god-mode override for operational unblocking.
    const isSysAdmin = hasRole(RoleName.SYS_ADMIN);

    let newStatus: PurchaseRequestStatus;
    let actorRoleLabel: string;

    if (pr.status === PurchaseRequestStatus.PENDING_MANAGER_APPROVAL) {
      if (!hasRole(RoleName.MANAGER) && !isSysAdmin) {
        throw new ForbiddenException('Only managers (or SYS_ADMIN) can approve at this stage');
      }
      actorRoleLabel = 'MANAGER';
      if (dto.decision === ApprovePrDecision.APPROVED) {
        newStatus = PurchaseRequestStatus.PENDING_FINANCE_APPROVAL;
      } else if (dto.decision === ApprovePrDecision.REJECTED) {
        newStatus = PurchaseRequestStatus.REJECTED;
      } else {
        newStatus = PurchaseRequestStatus.ON_HOLD;
      }
    } else if (pr.status === PurchaseRequestStatus.PENDING_FINANCE_APPROVAL) {
      if (!hasRole(RoleName.FINANCE) && !isSysAdmin) {
        throw new ForbiddenException('Only finance (or SYS_ADMIN) can approve at this stage');
      }
      // §B — separation-of-duties: same person cannot approve both manager and finance stages
      if (!isSysAdmin) {
        const priorManagerStep = await this.prisma.approvalStep.findFirst({
          where: { parentType: 'PurchaseRequest', parentId: id, role: 'MANAGER', approverId: actor.id },
        });
        if (priorManagerStep) {
          throw new ForbiddenException(
            'Separation of duties: the same person cannot approve both manager and finance stages',
          );
        }
      }
      actorRoleLabel = 'FINANCE';
      if (dto.decision === ApprovePrDecision.APPROVED) {
        newStatus = PurchaseRequestStatus.FINANCE_APPROVED;
      } else if (dto.decision === ApprovePrDecision.REJECTED) {
        newStatus = PurchaseRequestStatus.REJECTED;
      } else {
        newStatus = PurchaseRequestStatus.ON_HOLD;
      }
    } else if (pr.status === PurchaseRequestStatus.ON_HOLD) {
      // Only SYS_ADMIN can re-submit an ON_HOLD PR back into the approval chain
      if (!isSysAdmin) throw new ForbiddenException('Only SYS_ADMIN can re-activate an on-hold request');
      actorRoleLabel = 'SYS_ADMIN';
      newStatus = dto.decision === ApprovePrDecision.REJECTED
        ? PurchaseRequestStatus.REJECTED
        : PurchaseRequestStatus.PENDING_MANAGER_APPROVAL;
    } else {
      throw new BadRequestException(`Cannot approve a request in status ${pr.status}`);
    }

    const [step, updated] = await this.prisma.$transaction([
      this.prisma.approvalStep.create({
        data: {
          parentType: 'PurchaseRequest',
          parentId:   id,
          approverId: actor.id,
          role:       actorRoleLabel,
          decision:   dto.decision as unknown as ApprovalDecision,
          comment:    dto.comment ?? null,
        },
      }),
      this.prisma.purchaseRequest.update({
        where:   { id },
        data:    { status: newStatus },
        include: PR_INCLUDE,
      }),
    ]);

    await this.audit.log({
      actorId:  actor.id,
      entity:   'PurchaseRequest',
      entityId: id,
      action:   `APPROVAL_${dto.decision}`,
      before:   { status: pr.status },
      after:    { status: newStatus, role: actorRoleLabel },
    });

    // Notifications
    if (newStatus === PurchaseRequestStatus.PENDING_FINANCE_APPROVAL) {
      await this.notifyFinance(id, pr.itemSpec, pr.raisedBy.name);
    } else if (newStatus === PurchaseRequestStatus.FINANCE_APPROVED) {
      await this.notifyAdminsFinanceApproved(id, pr.itemSpec);
    } else if (newStatus === PurchaseRequestStatus.REJECTED) {
      await this.notifyRequesterRejected(
        pr.raisedBy.email, pr.raisedBy.name, id, pr.itemSpec, dto.comment,
      );
    }

    return { ...updated, approvalStep: step };
  }

  // ── PO recording ──────────────────────────────────────────────────────────

  async recordPo(id: string, dto: RecordPoDto, actor: AuthenticatedUser) {
    const pr = await this.prisma.purchaseRequest.findUnique({ where: { id } });
    if (!pr) throw new NotFoundException(`PurchaseRequest ${id} not found`);
    if (pr.status !== PurchaseRequestStatus.FINANCE_APPROVED) {
      throw new BadRequestException(
        `PO can only be raised when status is FINANCE_APPROVED (current: ${pr.status})`,
      );
    }

    const updated = await this.prisma.purchaseRequest.update({
      where:   { id },
      data:    {
        poNumber:   dto.poNumber,
        vendorId:   dto.vendorId,
        actualCost: dto.actualCost,
        status:     PurchaseRequestStatus.PO_RAISED,
      },
      include: PR_INCLUDE,
    });

    await this.audit.log({
      actorId:  actor.id,
      entity:   'PurchaseRequest',
      entityId: id,
      action:   'PO_RAISED',
      before:   { status: pr.status },
      after:    { status: PurchaseRequestStatus.PO_RAISED, poNumber: dto.poNumber },
    });

    return updated;
  }

  // ── Receipt recording + device creation ───────────────────────────────────

  async recordReceipt(id: string, dto: RecordReceiptDto, actor: AuthenticatedUser) {
    const pr = await this.prisma.purchaseRequest.findUnique({
      where:   { id },
      include: {
        ...PR_INCLUDE,
        deviceRequest: {
          include: { requester: { select: { id: true, name: true, email: true } } },
        },
      },
    });
    if (!pr) throw new NotFoundException(`PurchaseRequest ${id} not found`);
    if (pr.status !== PurchaseRequestStatus.PO_RAISED) {
      throw new BadRequestException(
        `Items can only be received when status is PO_RAISED (current: ${pr.status})`,
      );
    }

    const deviceId = await this.generateDeviceId(dto.type);

    const [device, updatedPr] = await this.prisma.$transaction([
      this.prisma.device.create({
        data: {
          id:           deviceId,
          type:         dto.type,
          makeModel:    dto.makeModel ?? '',
          serialNumber: dto.serialNumber,
          status:       DeviceStatus.AVAILABLE,
          condition:    dto.condition ?? null,
          cost:         pr.actualCost,
          purchasedOn:  new Date(),
        },
      }),
      this.prisma.purchaseRequest.update({
        where:   { id },
        data:    { receivedAt: new Date(), status: PurchaseRequestStatus.RECEIVED },
        include: PR_INCLUDE,
      }),
    ]);

    await this.audit.log({
      actorId:  actor.id,
      entity:   'PurchaseRequest',
      entityId: id,
      action:   'RECEIVED',
      before:   { status: pr.status },
      after:    { status: PurchaseRequestStatus.RECEIVED, deviceId },
    });
    await this.audit.log({
      actorId:  actor.id,
      entity:   'Device',
      entityId: deviceId,
      action:   'CREATE_FROM_PURCHASE',
      after:    { type: dto.type, serialNumber: dto.serialNumber, purchaseRequestId: id },
    });

    // Notify original device request requester if linked
    if (pr.deviceRequest?.requester) {
      const { email, name } = pr.deviceRequest.requester;
      await this.notifyDeviceAvailable(email, name, pr.deviceRequest.deviceType);
    }

    return { ...updatedPr, device };
  }

  // ── Auto-create on DeviceRequest approval ─────────────────────────────────

  @OnEvent('device.request.approved')
  async handleDeviceRequestApproved(event: {
    deviceRequestId: string;
    deviceType:      string;
    actorId:         string;
  }): Promise<void> {
    try {
      const available = await this.prisma.device.count({
        where: { type: event.deviceType, status: DeviceStatus.AVAILABLE },
      });
      if (available > 0) return; // Existing stock — no purchase needed

      const id = await this.generatePrId();
      await this.prisma.purchaseRequest.create({
        data: {
          id,
          raisedById:      event.actorId,
          deviceRequestId: event.deviceRequestId,
          itemSpec:        `${event.deviceType} — auto-raised for device request ${event.deviceRequestId}`,
          quantity:        1,
          estCost:         '0',
          budgetCode:      'TBD',
          status:          PurchaseRequestStatus.RAISED,
        },
      });

      await this.audit.log({
        actorId:  event.actorId,
        entity:   'PurchaseRequest',
        entityId: id,
        action:   'AUTO_CREATE',
        after:    { deviceRequestId: event.deviceRequestId, status: 'RAISED' },
      });

      // Notify IT admins to review and submit the auto-raised PR
      const admins = await this.prisma.user.findMany({
        where: {
          userRoles: { some: { role: { name: RoleName.IT_ADMIN } } },
          status:    UserStatus.ACTIVE,
        },
        select: { email: true, name: true },
      });
      for (const admin of admins) {
        await this.notifyAutoCreatedPr(admin.email, admin.name, id, event.deviceType);
      }
    } catch (err) {
      this.logger.error(
        `handleDeviceRequestApproved failed for ${event.deviceRequestId}: ${(err as Error).message}`,
      );
    }
  }

  // ── Email helpers ─────────────────────────────────────────────────────────

  private async notifyManagers(prId: string, itemSpec: string, raisedByName: string) {
    const managers = await this.prisma.user.findMany({
      where: {
        userRoles: { some: { role: { name: RoleName.MANAGER } } },
        status:    UserStatus.ACTIVE,
      },
      select: { email: true, name: true },
    });
    const url = `${FRONTEND_URL}/admin/purchase-requests`;
    for (const m of managers) {
      const html = this.buildEmail({
        color:  '#d97706',
        title:  'Purchase Request Awaiting Your Approval',
        body:   `<p>Hi ${m.name},</p>
                 <p>A new purchase request requires your approval.</p>
                 ${this.prBlock(prId, itemSpec, raisedByName)}
                 ${this.actionButton(url, 'Review Request')}`,
      });
      await this.notifications.sendAdHoc(
        m.email, m.name,
        'purchase.request.pending_manager',
        '[TicketZilla] Purchase Request Needs Your Approval',
        html, `Purchase request ${prId} (${itemSpec}) needs your approval.\n${url}`,
      );
    }
  }

  private async notifyFinance(prId: string, itemSpec: string, raisedByName: string) {
    const team = await this.prisma.user.findMany({
      where: {
        userRoles: { some: { role: { name: RoleName.FINANCE } } },
        status:    UserStatus.ACTIVE,
      },
      select: { email: true, name: true },
    });
    const url = `${FRONTEND_URL}/finance/purchase-requests`;
    for (const f of team) {
      const html = this.buildEmail({
        color:  '#0369a1',
        title:  'Purchase Request Awaiting Finance Approval',
        body:   `<p>Hi ${f.name},</p>
                 <p>A purchase request has been approved by management and needs finance sign-off.</p>
                 ${this.prBlock(prId, itemSpec, raisedByName)}
                 ${this.actionButton(url, 'Review Request')}`,
      });
      await this.notifications.sendAdHoc(
        f.email, f.name,
        'purchase.request.pending_finance',
        '[TicketZilla] Purchase Request Needs Finance Approval',
        html, `Purchase request ${prId} (${itemSpec}) needs finance approval.\n${url}`,
      );
    }
  }

  private async notifyAdminsFinanceApproved(prId: string, itemSpec: string) {
    const admins = await this.prisma.user.findMany({
      where: {
        userRoles: { some: { role: { name: RoleName.IT_ADMIN } } },
        status:    UserStatus.ACTIVE,
      },
      select: { email: true, name: true },
    });
    const url = `${FRONTEND_URL}/admin/purchase-requests`;
    for (const a of admins) {
      const html = this.buildEmail({
        color:  '#16a34a',
        title:  'Purchase Request Finance-Approved — Raise PO',
        body:   `<p>Hi ${a.name},</p>
                 <p>Finance has approved the following request. Please raise a PO.</p>
                 ${this.prBlock(prId, itemSpec)}
                 ${this.actionButton(url, 'Raise PO')}`,
      });
      await this.notifications.sendAdHoc(
        a.email, a.name,
        'purchase.request.finance_approved',
        '[TicketZilla] Purchase Request Finance-Approved — Please Raise PO',
        html, `Finance approved PR ${prId} (${itemSpec}). Please raise the PO.\n${url}`,
      );
    }
  }

  private async notifyRequesterRejected(
    toEmail: string, toName: string, prId: string, itemSpec: string, comment?: string,
  ) {
    const html = this.buildEmail({
      color: '#dc2626',
      title: 'Purchase Request Rejected',
      body:  `<p>Hi ${toName},</p>
              <p>Your purchase request for <strong>${itemSpec}</strong> has been rejected.</p>
              ${comment ? `<p><strong>Reason:</strong> ${comment}</p>` : ''}
              <p style="color:#6b7280;font-size:12px">Reference: ${prId}</p>`,
    });
    await this.notifications.sendAdHoc(
      toEmail, toName, 'purchase.request.rejected',
      '[TicketZilla] Purchase Request Rejected',
      html, `Your PR ${prId} (${itemSpec}) was rejected.${comment ? ` Reason: ${comment}` : ''}`,
    );
  }

  private async notifyDeviceAvailable(toEmail: string, toName: string, deviceType: string) {
    const html = this.buildEmail({
      color: '#16a34a',
      title: 'Your Device Is Now Available',
      body:  `<p>Hi ${toName},</p>
              <p>The <strong>${deviceType}</strong> you requested has been purchased and is now available.</p>
              <p>Our IT team will contact you shortly to arrange allocation.</p>`,
    });
    await this.notifications.sendAdHoc(
      toEmail, toName, 'device.purchased_available',
      '[TicketZilla] Your Requested Device Is Now Available',
      html, `Hi ${toName}, your requested ${deviceType} has arrived and is available for allocation.`,
    );
  }

  private async notifyAutoCreatedPr(
    toEmail: string, toName: string, prId: string, deviceType: string,
  ) {
    const url = `${FRONTEND_URL}/admin/purchase-requests`;
    const html = this.buildEmail({
      color: '#7c3aed',
      title: 'Auto-Created Purchase Request Needs Review',
      body:  `<p>Hi ${toName},</p>
              <p>A purchase request was automatically created because no <strong>${deviceType}</strong> is
              available in stock to fulfil an approved device request.</p>
              ${this.prBlock(prId, deviceType)}
              <p>Please review, update the cost and budget code, then submit for approval.</p>
              ${this.actionButton(url, 'View Purchase Requests')}`,
    });
    await this.notifications.sendAdHoc(
      toEmail, toName, 'purchase.request.auto_created',
      `[TicketZilla] Auto-Created PR for ${deviceType} Needs Review`,
      html, `Auto-created PR ${prId} for ${deviceType} needs review.\n${url}`,
    );
  }

  // ── HTML helpers ──────────────────────────────────────────────────────────

  private buildEmail({ color, title, body }: { color: string; title: string; body: string }) {
    return `
<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;
            border:1px solid #e5e7eb;border-radius:8px;border-top:4px solid ${color}">
  <h2 style="color:${color};margin-top:0">${title}</h2>
  ${body}
  <hr style="border:none;border-top:1px solid #e5e7eb;margin-top:24px"/>
  <p style="color:#6b7280;font-size:12px">TicketZilla — automated notification</p>
</div>`;
  }

  private prBlock(prId: string, itemSpec: string, raisedByName?: string) {
    return `
<blockquote style="border-left:4px solid #e5e7eb;padding:8px 16px;background:#f9fafb;margin:12px 0">
  <strong>Reference:</strong> ${prId}<br/>
  <strong>Item:</strong> ${itemSpec}
  ${raisedByName ? `<br/><strong>Raised by:</strong> ${raisedByName}` : ''}
</blockquote>`;
  }

  private actionButton(url: string, label: string) {
    return `<p><a href="${url}" style="display:inline-block;padding:10px 20px;
      background:#1d4ed8;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
      ${label}</a></p>`;
  }
}
