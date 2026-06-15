import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { KBArticleStatus, Prisma, RoleName } from '@prisma/client';
import { AiAdapterService } from '../ai/ai-adapter.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { FeedbackDto } from './dto/feedback.dto';
import { ListArticlesDto } from './dto/list-articles.dto';
import { UpdateArticleDto } from './dto/update-article.dto';

const EDITOR_ROLES: RoleName[] = [
  RoleName.AGENT, RoleName.L2_L3, RoleName.IT_ADMIN, RoleName.SYS_ADMIN,
];

const PUBLISH_ROLES: RoleName[] = [RoleName.IT_ADMIN, RoleName.SYS_ADMIN];

// Shape returned by the PostgreSQL FTS raw query
type RawArticleRow = {
  id: string;
  title: string;
  status: string;
  tags: string[];
  views: number;
  helpfulCount: number;
  createdAt: Date;
  updatedAt: Date;
  categoryId: string | null;
  categoryName: string | null;
};

@Injectable()
export class KbService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiAdapterService,
  ) {}

  // ── List ─────────────────────────────────────────────────────────────────

  async findAll(query: ListArticlesDto, actor: AuthenticatedUser) {
    const { q, categoryId, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const isEditor = actor.roles.some(r => EDITOR_ROLES.includes(r));
    // Non-editors always see only PUBLISHED; editors can filter or see all
    const status = query.status ?? (isEditor ? undefined : KBArticleStatus.PUBLISHED);

    const trimmedQ = q?.trim();
    if (trimmedQ) {
      return this.findAllFts(trimmedQ, { categoryId, status, page, limit, skip });
    }

    // ── Standard Prisma path (no search term) ──────────────────────────────
    const where: Prisma.KBArticleWhereInput = {
      ...(status     && { status }),
      ...(categoryId && { categoryId }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.kBArticle.findMany({
        where,
        select: {
          id: true, title: true, status: true, tags: true,
          views: true, helpfulCount: true, createdAt: true, updatedAt: true,
          category: { select: { id: true, name: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.kBArticle.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  // ── PostgreSQL full-text search ───────────────────────────────────────────

  private async findAllFts(
    q: string,
    opts: {
      categoryId?: string;
      status?: KBArticleStatus;
      page: number;
      limit: number;
      skip: number;
    },
  ) {
    const { categoryId, status, page, limit, skip } = opts;

    // Build the tsvector / tsquery expressions once; reused in WHERE and ORDER BY
    const tsvector = Prisma.sql`
      to_tsvector('english',
        coalesce(a.title, '') || ' ' ||
        coalesce(a.body, '')  || ' ' ||
        coalesce(array_to_string(a.tags, ' '), '')
      )
    `;
    const tsquery = Prisma.sql`plainto_tsquery('english', ${q})`;

    const ftsClause = Prisma.sql`${tsvector} @@ ${tsquery}`;

    // Optional extra AND conditions
    const extras: Prisma.Sql[] = [];
    if (status)     extras.push(Prisma.sql`a.status = ${status}::"KBArticleStatus"`);
    if (categoryId) extras.push(Prisma.sql`a."categoryId" = ${categoryId}`);

    const andExtras = extras.length
      ? Prisma.sql`AND ${Prisma.join(extras, ' AND ')}`
      : Prisma.sql``;

    const [rows, countResult] = await Promise.all([
      this.prisma.$queryRaw<RawArticleRow[]>`
        SELECT
          a.id, a.title, a.status, a.tags, a.views,
          a."helpfulCount", a."createdAt", a."updatedAt",
          c.id   AS "categoryId",
          c.name AS "categoryName"
        FROM   "KBArticle" a
        LEFT JOIN "Category" c ON c.id = a."categoryId"
        WHERE  ${ftsClause} ${andExtras}
        ORDER  BY ts_rank(${tsvector}, ${tsquery}) DESC
        LIMIT  ${limit}
        OFFSET ${skip}
      `,
      this.prisma.$queryRaw<[{ count: bigint }]>`
        SELECT count(*) FROM "KBArticle" a WHERE ${ftsClause} ${andExtras}
      `,
    ]);

    const data = rows.map(r => ({
      id:           r.id,
      title:        r.title,
      status:       r.status,
      tags:         r.tags,
      views:        r.views,
      helpfulCount: r.helpfulCount,
      createdAt:    r.createdAt,
      updatedAt:    r.updatedAt,
      category:     r.categoryId ? { id: r.categoryId, name: r.categoryName! } : null,
    }));

    return { data, total: Number(countResult[0].count), page, limit };
  }

  // ── Get one ───────────────────────────────────────────────────────────────

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

    // Increment view count — fire-and-forget
    this.prisma.kBArticle
      .update({ where: { id }, data: { views: { increment: 1 } } })
      .catch(() => undefined);

    return article;
  }

  // ── Create ────────────────────────────────────────────────────────────────

  async create(dto: CreateArticleDto, actor: AuthenticatedUser) {
    if (!actor.roles.some(r => EDITOR_ROLES.includes(r))) {
      throw new ForbiddenException('Only agents and admins can create KB articles');
    }
    // New articles always start as DRAFT regardless of what the client sends
    return this.prisma.kBArticle.create({
      data: {
        title:      dto.title,
        body:       dto.body,
        tags:       dto.tags ?? [],
        status:     KBArticleStatus.DRAFT,
        ...(dto.categoryId && { categoryId: dto.categoryId }),
      },
      include: { category: { select: { id: true, name: true } } },
    });
  }

  // ── Update ────────────────────────────────────────────────────────────────

  async update(id: string, dto: UpdateArticleDto, actor: AuthenticatedUser) {
    if (!actor.roles.some(r => EDITOR_ROLES.includes(r))) {
      throw new ForbiddenException('Only agents and admins can edit KB articles');
    }
    const existing = await this.prisma.kBArticle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`KB article ${id} not found`);

    const article = await this.prisma.kBArticle.update({
      where: { id },
      data: {
        ...(dto.title      !== undefined && { title:      dto.title }),
        ...(dto.body       !== undefined && { body:       dto.body }),
        ...(dto.tags       !== undefined && { tags:       dto.tags }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        // status is NOT updatable via PATCH — use the dedicated /publish endpoint
      },
      include: { category: { select: { id: true, name: true } } },
    });

    // Re-sync AI vector store if the article is already published
    if (existing.status === KBArticleStatus.PUBLISHED) {
      this.ai.syncKb().catch(() => undefined);
    }

    return article;
  }

  // ── Publish ───────────────────────────────────────────────────────────────

  async publish(id: string, actor: AuthenticatedUser) {
    if (!actor.roles.some(r => PUBLISH_ROLES.includes(r))) {
      throw new ForbiddenException('Only IT admins can publish KB articles');
    }
    const existing = await this.prisma.kBArticle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`KB article ${id} not found`);
    if (existing.status !== KBArticleStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT articles can be published');
    }

    const article = await this.prisma.kBArticle.update({
      where: { id },
      data:  { status: KBArticleStatus.PUBLISHED },
      include: { category: { select: { id: true, name: true } } },
    });

    this.ai.syncKb().catch(() => undefined);
    return article;
  }

  // ── Archive ───────────────────────────────────────────────────────────────

  async archive(id: string, actor: AuthenticatedUser) {
    if (!actor.roles.some(r => PUBLISH_ROLES.includes(r))) {
      throw new ForbiddenException('Only admins can archive KB articles');
    }
    const existing = await this.prisma.kBArticle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`KB article ${id} not found`);

    return this.prisma.kBArticle.update({
      where: { id },
      data:  { status: KBArticleStatus.ARCHIVED },
    });
  }

  // ── Feedback (helpful / not helpful) ─────────────────────────────────────

  async feedback(id: string, dto: FeedbackDto) {
    const existing = await this.prisma.kBArticle.findUnique({ where: { id } });
    if (!existing || existing.status !== KBArticleStatus.PUBLISHED) {
      throw new NotFoundException(`KB article ${id} not found`);
    }

    if (!dto.helpful) {
      // "No" vote — acknowledged but not counted
      return { id, helpfulCount: existing.helpfulCount, recorded: true };
    }

    return this.prisma.kBArticle.update({
      where: { id },
      data:  { helpfulCount: { increment: 1 } },
      select: { id: true, helpfulCount: true },
    });
  }
}
