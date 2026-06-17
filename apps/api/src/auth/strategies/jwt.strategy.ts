import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { AccountStatus, UserStatus } from '@prisma/client';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser, JwtPayload } from '../auth.types';

function extractJwtFromCookieOrBearer(req: Request): string | null {
  const cookie = req.cookies?.['access_token'] as string | undefined;
  if (cookie) return cookie;
  return ExtractJwt.fromAuthHeaderAsBearerToken()(req);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: extractJwtFromCookieOrBearer,
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      passReqToCallback: false,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { userRoles: { include: { role: true } } },
    });

    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      user.accountStatus !== AccountStatus.ACTIVE
    ) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return {
      id: user.id,
      email: user.email,
      roles: user.userRoles.map((ur) => ur.role.name),
    };
  }
}
