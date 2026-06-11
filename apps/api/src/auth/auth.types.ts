import { RoleName } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  roles: RoleName[];
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: RoleName[];
}
