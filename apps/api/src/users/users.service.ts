import { Injectable } from '@nestjs/common';
import { RoleName, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(role?: RoleName) {
    return this.prisma.user.findMany({
      where: {
        status: UserStatus.ACTIVE,
        ...(role && {
          userRoles: { some: { role: { name: role } } },
        }),
      },
      select: { id: true, name: true, email: true, department: true },
      orderBy: { name: 'asc' },
    });
  }
}
