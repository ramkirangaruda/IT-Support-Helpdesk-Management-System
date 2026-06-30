import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { OidcService } from './oidc.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthenticatedUser } from './auth.types';
import { Public } from './decorators/public.decorator';
import { DevLoginDto } from './dto/dev-login.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterUserDto } from './dto/register-user.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly oidcService: OidcService,
  ) {}

  // ── Dev-only ──────────────────────────────────────────────────────────────

  @Post('dev-login')
  @Public()
  devLogin(@Body() dto: DevLoginDto) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Not available in production');
    }
    return this.authService.devLogin(dto.email);
  }

  // ── Real auth ─────────────────────────────────────────────────────────────

  /**
   * POST /api/auth/register
   * 5 requests per hour per IP (overrides the default 100/min throttler).
   */
  @Post('register')
  @Public()
  @Throttle({ default: { ttl: 3_600_000, limit: 5 } })
  register(@Body() dto: RegisterUserDto) {
    return this.authService.register(dto);
  }

  /**
   * POST /api/auth/login
   * Per-email lockout (5 failures / 15 min) is enforced inside AuthService.
   * The global 100/min IP throttler still applies here.
   */
  @Post('login')
  @Public()
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * GET /api/auth/me — current user profile (protected by the global JwtAuthGuard).
   */
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.id);
  }

  // ── OIDC ──────────────────────────────────────────────────────────────────

  @Get('oidc/login')
  @Public()
  async oidcLogin(@Res() res: Response) {
    const { url, state } = await this.oidcService.buildAuthorizationUrl();
    res.cookie('oidc_state', state, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000,
      secure: process.env.NODE_ENV === 'production',
    });
    return res.redirect(url);
  }

  @Get('oidc/callback')
  @Public()
  async oidcCallback(
    @Query() query: Record<string, string>,
    @Req()   req:   Request,
    @Res()   res:   Response,
  ) {
    const state = req.cookies?.['oidc_state'] as string | undefined;
    if (!state) {
      return res.status(400).json({ message: 'Missing OIDC state cookie' });
    }
    res.clearCookie('oidc_state');

    const { access_token } = await this.oidcService.handleCallback(query, state);

    res.cookie('access_token', access_token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000,
      secure: process.env.NODE_ENV === 'production',
    });

    return res.json({ access_token });
  }
}
