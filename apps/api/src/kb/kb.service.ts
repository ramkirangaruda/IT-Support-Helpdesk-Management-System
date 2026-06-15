import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { KBArticleStatus, RoleName } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { ListArticlesDto } from './dto/list-articles.dto';
import { UpdateArticleDto } from './dto/update-article.dto';

const EDITOR_ROLES: RoleName[] = [
  RoleName.AGENT, RoleName.L2_L3, RoleName.IT_ADMIN, RoleName.SYS_ADMIN,
];

@Injectable()
export class KbService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListArticlesDto, actor: AuthenticatedUser) {
    const { q, categoryId, page = 1, limit = 20 } = query;

    // Non-editors only see PUBLISHED articles
    const isEditor = actor.roles.some(r => EDITOR_ROLES.includes(r));
    const status = query.status ?? (isEditor ? undefined : KBArticleStatus.PUBLISHED);

    const where = {
      ...(status && { status }),
      ...(categoryId && { categoryId }),
      ...(q && {
        OR: [
          { title: { contains: q, mode: 'insensitive' as const } },
          { body:  { contains: q, mode: 'insensitive' as const } },
          { tags:  { has: q } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.kBArticle.findMany({
        where,
        select: {
          id: true, title: true, status: true, tags: true, views: true,
          helpfulCount: true, createdAt: true, updatedAt: true,
          category: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.kBArticle.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const article = await this.prisma.kBArticle.findUnique({
      where: { id },
      include: { category: { select: { id: true, name: true } } },
    });
    if (!article) throw new NotFoundException(`KB article ${id} not found`);

    const isEditor = actor.roles.some(r => EDITOR_ROLES.includes(r));
    if (!isEditor && article.status !== KBArticleStatus.PUBLISHED) {
      throw new NotFoundException(`KB article ${id} not found`);
    }

    // Increment view count (fire-and-forget)
    this.prisma.kBArticle.update({ where: { id }, data: { views: { increment: 1 } } })
      .catch(() => undefined);

    return article;
  }

  async create(dto: CreateArticleDto, actor: AuthenticatedUser) {
    if (!actor.roles.some(r => EDITOR_ROLES.includes(r))) {
      throw new ForbiddenException('Only agents and admins can create KB articles');
    }
    return this.prisma.kBArticle.create({
      data: {
        title:      dto.title,
        body:       dto.body,
        tags:       dto.tags ?? [],
        status:     dto.status ?? KBArticleStatus.DRAFT,
        ...(dto.categoryId && { categoryId: dto.categoryId }),
      },
      include: { category: { select: { id: true, name: true } } },
    });
  }

  async update(id: string, dto: UpdateArticleDto, actor: AuthenticatedUser) {
    if (!actor.roles.some(r => EDITOR_ROLES.includes(r))) {
      throw new ForbiddenException('Only agents and admins can edit KB articles');
    }
    const existing = await this.prisma.kBArticle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`KB article ${id} not found`);

    return this.prisma.kBArticle.update({
      where: { id },
      data: {
        ...(dto.title      !== undefined && { title:      dto.title }),
        ...(dto.body       !== undefined && { body:       dto.body }),
        ...(dto.tags       !== undefined && { tags:       dto.tags }),
        ...(dto.status     !== undefined && { status:     dto.status }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
      },
      include: { category: { select: { id: true, name: true } } },
    });
  }

  async archive(id: string, actor: AuthenticatedUser) {
    const adminRoles: RoleName[] = [RoleName.IT_ADMIN, RoleName.SYS_ADMIN];
    if (!actor.roles.some(r => adminRoles.includes(r))) {
      throw new ForbiddenException('Only admins can archive KB articles');
    }
    const existing = await this.prisma.kBArticle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`KB article ${id} not found`);

    return this.prisma.kBArticle.update({
      where: { id },
      data: { status: KBArticleStatus.ARCHIVED },
    });
  }

  async markHelpful(id: string) {
    const existing = await this.prisma.kBArticle.findUnique({ where: { id } });
    if (!existing || existing.status !== KBArticleStatus.PUBLISHED) {
      throw new NotFoundException(`KB article ${id} not found`);
    }
    return this.prisma.kBArticle.update({
      where: { id },
      data: { helpfulCount: { increment: 1 } },
      select: { id: true, helpfulCount: true },
    });
  }
}
