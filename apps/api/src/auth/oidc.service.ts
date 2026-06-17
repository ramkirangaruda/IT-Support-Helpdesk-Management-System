import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserStatus } from '@prisma/client';
import { Issuer, generators, Client, TokenSet } from 'openid-client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './auth.types';

@Injectable()
export class OidcService {
  private readonly logger = new Logger(OidcService.name);
  private client: Client | null = null;
  private readonly codeVerifiers = new Map<string, string>(); // state → PKCE verifier

  private readonly issuerUrl:    string | undefined;
  private readonly clientId:     string | undefined;
  private readonly clientSecret: string | undefined;
  private readonly callbackUrl:  string | undefined;

  constructor(
    private readonly config:  ConfigService,
    private readonly prisma:  PrismaService,
    private readonly jwt:     JwtService,
  ) {
    this.issuerUrl    = config.get<string>('OIDC_ISSUER');
    this.clientId     = config.get<string>('OIDC_CLIENT_ID');
    this.clientSecret = config.get<string>('OIDC_CLIENT_SECRET');
    this.callbackUrl  = config.get<string>('OIDC_CALLBACK_URL');
  }

  isConfigured(): boolean {
    return !!(this.issuerUrl && this.clientId && this.clientSecret && this.callbackUrl);
  }

  private async getClient(): Promise<Client> {
    if (!this.client) {
      if (!this.isConfigured()) {
        throw new UnauthorizedException('OIDC is not configured — set OIDC_ISSUER, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_CALLBACK_URL');
      }
      const issuer = await Issuer.discover(this.issuerUrl!);
      this.client = new issuer.Client({
        client_id:     this.clientId!,
        client_secret: this.clientSecret!,
        redirect_uris: [this.callbackUrl!],
        response_types: ['code'],
      });
      this.logger.log(`OIDC client initialized for issuer: ${this.issuerUrl}`);
    }
    return this.client;
  }

  /** Build the authorization URL. Returns { url, state } — state goes in a short-lived cookie. */
  async buildAuthorizationUrl(): Promise<{ url: string; state: string }> {
    const client       = await this.getClient();
    const state        = generators.state();
    const codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(codeVerifier);

    this.codeVerifiers.set(state, codeVerifier);
    // Expire entries after 10 minutes to prevent unbounded growth
    setTimeout(() => this.codeVerifiers.delete(state), 10 * 60 * 1000);

    const url = client.authorizationUrl({
      scope: 'openid email profile',
      state,
      code_challenge:        codeChallenge,
      code_challenge_method: 'S256',
    });

    return { url, state };
  }

  /**
   * Exchange the authorization code for tokens, look up the user by ssoSubject.
   * No auto-provisioning: throws 404 if user is not pre-created in the system.
   */
  async handleCallback(
    callbackParams: Record<string, string>,
    state: string,
  ): Promise<{ access_token: string }> {
    const client       = await this.getClient();
    const codeVerifier = this.codeVerifiers.get(state);
    if (!codeVerifier) {
      throw new UnauthorizedException('Invalid or expired OIDC state parameter');
    }
    this.codeVerifiers.delete(state);

    let tokenSet: TokenSet;
    try {
      tokenSet = await client.callback(this.callbackUrl!, callbackParams, {
        state,
        code_verifier: codeVerifier,
      });
    } catch (err) {
      this.logger.error('OIDC callback failed', err);
      throw new UnauthorizedException('OIDC token exchange failed');
    }

    const claims     = tokenSet.claims();
    const ssoSubject = claims.sub;

    const user = await this.prisma.user.findUnique({
      where:   { ssoSubject },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new NotFoundException(
        `No active TicketZilla account is linked to this identity (sub=${ssoSubject}). Contact your IT administrator.`,
      );
    }

    const payload: JwtPayload = {
      sub:   user.id,
      email: user.email,
      roles: user.userRoles.map(ur => ur.role.name),
    };

    return { access_token: this.jwt.sign(payload) };
  }
}
