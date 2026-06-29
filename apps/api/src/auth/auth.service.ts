import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  AccountStatus,
  NotificationChannel,
  NotificationStatus,
  RoleName,
  UserStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { JwtPayload } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterUserDto } from './dto/register-user.dto';

const BCRYPT_ROUNDS = 12;
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000; // 15 min
const MAX_FAILED_ATTEMPTS = 5;

interface AttemptRecord {
  count: number;
  windowStart: number;
}

// Fields safe to return from user queries — passwordHash deliberately excluded
const SAFE_USER_SELECT = {
  id: true,
  name: true,
  email: true,
  department: true,
  accountStatus: true,
  status: true,
  createdAt: true,
  userRoles: { include: { role: true } },
} as const;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  // In-memory per-email failed-attempt tracker
  private readonly failedAttempts = new Map<string, AttemptRecord>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly notifications: NotificationsService,
  ) {}

  // ── Dev login (non-production only) ──────────────────────────────────────

  async devLogin(email: string): Promise<{ access_token: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(`No active user found with email ${email}`);
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.userRoles.map((ur) => ur.role.name),
    };
    return { access_token: this.jwt.sign(payload) };
  }

  // ── Self-registration ─────────────────────────────────────────────────────

  async register(dto: RegisterUserDto): Promise<{ message: string }> {
    const existing = await this.prisma.user.findFirst({
      where: { email: { equals: dto.email, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        department: dto.department,
        passwordHash,
        accountStatus: AccountStatus.PENDING_APPROVAL,
        // ssoSubject left null — SSO not applicable for self-registered users
      },
      select: { id: true, name: true, email: true },
    });

    // Notify all IT_ADMIN users of the pending registration
    const admins = await this.prisma.user.findMany({
      where: {
        userRoles: { some: { role: { name: RoleName.IT_ADMIN } } },
        status: UserStatus.ACTIVE,
        accountStatus: AccountStatus.ACTIVE,
      },
      select: { email: true, name: true },
    });

    for (const admin of admins) {
      await this.notifications.sendAdHoc(admin.email, 'auth.registration_pending');
    }

    // In-app confirmation for the registrant (they'll see it once approved and logged in)
    await this.notifications.sendAdHoc(user.email, 'auth.registration_confirmation');

    this.logger.log(`New self-registration: ${user.email} (id=${user.id})`);
    return {
      message:
        'Your account has been created and is pending admin approval. You will be able to sign in once an administrator approves your account.',
    };
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  async login(dto: LoginDto): Promise<{ access_token: string }> {
    const emailKey = dto.email; // already lowercased by DTO transform

    // 1. Check per-email rate limit FIRST
    this.enforceRateLimit(emailKey);

    // 2. Look up user — select passwordHash explicitly here (only here)
    const user = await this.prisma.user.findFirst({
      where: { email: { equals: emailKey, mode: 'insensitive' } },
      include: { userRoles: { include: { role: true } } },
    });

    // 3. Generic error if no user or no password (SSO-only account)
    if (!user || !user.passwordHash) {
      await this.recordFailure(emailKey);
      throw new UnauthorizedException('Invalid email or password');
    }

    // 4. Verify password
    const match = await bcrypt.compare(dto.password, user.passwordHash);
    if (!match) {
      await this.recordFailure(emailKey);
      throw new UnauthorizedException('Invalid email or password');
    }

    // 5. Password correct — now check account state (intentionally different messages per spec)
    if (user.accountStatus === AccountStatus.PENDING_APPROVAL) {
      throw new UnauthorizedException(
        'Your account is pending admin approval. You will be notified once approved.',
      );
    }
    if (
      user.accountStatus === AccountStatus.REJECTED ||
      user.accountStatus === AccountStatus.SUSPENDED
    ) {
      throw new UnauthorizedException(
        'Your account is not active. Contact IT support.',
      );
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException(
        'Your account is not active. Contact IT support.',
      );
    }

    // 6. Success — clear failed attempt counter and issue JWT
    this.failedAttempts.delete(emailKey);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.userRoles.map((ur) => ur.role.name),
    };
    return { access_token: this.jwt.sign(payload) };
  }

  // ── Rate-limit helpers ────────────────────────────────────────────────────

  private enforceRateLimit(emailKey: string): void {
    const record = this.failedAttempts.get(emailKey);
    if (!record) return;

    const now = Date.now();
    if (now - record.windowStart > LOCKOUT_WINDOW_MS) {
      this.failedAttempts.delete(emailKey);
      return;
    }

    if (record.count >= MAX_FAILED_ATTEMPTS) {
      const remainingMs = LOCKOUT_WINDOW_MS - (now - record.windowStart);
      const mins = Math.ceil(remainingMs / 60_000);
      throw new UnauthorizedException(
        `Too many failed login attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`,
      );
    }
  }

  private async recordFailure(emailKey: string): Promise<void> {
    const now = Date.now();
    const record = this.failedAttempts.get(emailKey);

    if (!record || now - record.windowStart > LOCKOUT_WINDOW_MS) {
      this.failedAttempts.set(emailKey, { count: 1, windowStart: now });
    } else {
      record.count++;
      // Log to Notification table (appears in GET /admin/notifications?status=FAILED)
      // after 3rd failure so IT_ADMIN can see repeated attempts without noise
      if (record.count >= 3) {
        try {
          await this.prisma.notification.create({
            data: {
              ticketId: null,
              recipientEmail: emailKey,
              channel: NotificationChannel.IN_APP,
              event: 'auth.login_failed',
              status: NotificationStatus.FAILED,
            },
          });
        } catch {
          // Non-critical — don't fail the login response over this
        }
      }
    }
  }
}
