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
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { OidcService } from './oidc.service';
import { Public } from './decorators/public.decorator';
import { DevLoginDto } from './dto/dev-login.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly oidcService: OidcService,
  ) {}

  @Post('dev-login')
  @Public()
  devLogin(@Body() dto: DevLoginDto) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Not available in production');
    }
    return this.authService.devLogin(dto.email);
  }

  /** Initiate OIDC login — redirects to the configured identity provider. */
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

  /** OIDC callback — exchanges code, looks up user by ssoSubject, issues JWT. */
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

    // Issue as httpOnly cookie for browser sessions
    res.cookie('access_token', access_token, {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 8 * 60 * 60 * 1000,
      secure: process.env.NODE_ENV === 'production',
    });

    // Also return in body for API/SPA clients that prefer bearer tokens
    return res.json({ access_token });
  }
}
