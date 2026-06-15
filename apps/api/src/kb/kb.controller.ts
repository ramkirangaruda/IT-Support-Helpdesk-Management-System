import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { CreateArticleDto } from './dto/create-article.dto';
import { ListArticlesDto } from './dto/list-articles.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { KbService } from './kb.service';

@Controller('kb')
export class KbController {
  constructor(private readonly kbService: KbService) {}

  // ── GET /kb ────────────────────────────────────────────────────────────────
  @Get()
  findAll(@Query() query: ListArticlesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.kbService.findAll(query, user);
  }

  // ── POST /kb ───────────────────────────────────────────────────────────────
  @Post()
  create(@Body() dto: CreateArticleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.kbService.create(dto, user);
  }

  // ── GET /kb/:id ────────────────────────────────────────────────────────────
  // Must come after any fixed-path sub-routes if added later
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.kbService.findOne(id, user);
  }

  // ── PATCH /kb/:id ──────────────────────────────────────────────────────────
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.kbService.update(id, dto, user);
  }

  // ── DELETE /kb/:id ─────────────────────────────────────────────────────────
  // Soft-deletes (archives) — hard delete is never exposed
  @Delete(':id')
  archive(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.kbService.archive(id, user);
  }

  // ── POST /kb/:id/helpful ───────────────────────────────────────────────────
  @Post(':id/helpful')
  markHelpful(@Param('id') id: string) {
    return this.kbService.markHelpful(id);
  }
}
