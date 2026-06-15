import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { ProcurementService } from './procurement.service';
import { ApprovePrDto } from './dto/approve-pr.dto';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { CreateVendorDto } from './dto/create-vendor.dto';
import { RecordPoDto } from './dto/record-po.dto';
import { RecordReceiptDto } from './dto/record-receipt.dto';
import { UpdateVendorDto } from './dto/update-vendor.dto';

const ADMIN_ROLES    = [RoleName.IT_ADMIN, RoleName.SYS_ADMIN];
const APPROVE_ROLES  = [RoleName.MANAGER, RoleName.FINANCE, RoleName.IT_ADMIN, RoleName.SYS_ADMIN];
const VIEWER_ROLES   = [RoleName.IT_ADMIN, RoleName.SYS_ADMIN, RoleName.MANAGER, RoleName.FINANCE];

@Controller('purchase-requests')
export class PurchaseRequestController {
  constructor(private readonly service: ProcurementService) {}

  // POST /purchase-requests — IT_ADMIN / SYS_ADMIN
  @Post()
  @Roles(...ADMIN_ROLES)
  create(
    @Body() dto: CreatePurchaseRequestDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.create(dto, user);
  }

  // GET /purchase-requests — scoped by role
  @Get()
  @Roles(...VIEWER_ROLES)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.service.list(user);
  }

  // GET /purchase-requests/:id
  @Get(':id')
  @Roles(...VIEWER_ROLES)
  getOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.getOne(id, user);
  }

  // POST /purchase-requests/:id/approve
  @Post(':id/approve')
  @Roles(...APPROVE_ROLES)
  approve(
    @Param('id') id: string,
    @Body() dto: ApprovePrDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.approve(id, dto, user);
  }

  // POST /purchase-requests/:id/po — IT_ADMIN / SYS_ADMIN
  @Post(':id/po')
  @Roles(...ADMIN_ROLES)
  recordPo(
    @Param('id') id: string,
    @Body() dto: RecordPoDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.recordPo(id, dto, user);
  }

  // POST /purchase-requests/:id/receive — IT_ADMIN / SYS_ADMIN
  @Post(':id/receive')
  @Roles(...ADMIN_ROLES)
  recordReceipt(
    @Param('id') id: string,
    @Body() dto: RecordReceiptDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.recordReceipt(id, dto, user);
  }
}

// ── Vendor controller ─────────────────────────────────────────────────────────

@Controller('vendors')
export class VendorController {
  constructor(private readonly service: ProcurementService) {}

  @Get()
  @Roles(...VIEWER_ROLES)
  list() {
    return this.service.listVendors();
  }

  @Post()
  @Roles(...ADMIN_ROLES)
  create(@Body() dto: CreateVendorDto) {
    return this.service.createVendor(dto);
  }

  @Patch(':id')
  @Roles(...ADMIN_ROLES)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateVendorDto,
  ) {
    return this.service.updateVendor(id, dto);
  }
}
