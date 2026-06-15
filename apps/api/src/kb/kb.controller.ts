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
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { CreateArticleDto } from './dto/create-article.dto';
import { FeedbackDto } from './dto/feedback.dto';
import { ListArticlesDto } from './dto/list-articles.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { KbService } from './kb.service';

const EDITOR_ROLES = [RoleName.AGENT, RoleName.L2_L3, RoleName.IT_ADMIN, RoleName.SYS_ADMIN];
const PUBLISH_ROLES = [RoleName.IT_ADMIN, RoleName.SYS_ADMIN];

@Controller('kb/articles')
export class KbController {
  constructor(private readonly kbService: KbService) {}

  // GET /kb/articles?q=&categoryId=&status=&page=&limit=
  @Get()
  findAll(@Query() query: ListArticlesDto, @CurrentUser() user: AuthenticatedUser) {
    return this.kbService.findAll(query, user);
  }

  // POST /kb/articles  (AGENT, L2_L3, IT_ADMIN, SYS_ADMIN)
  @Post()
  @Roles(...EDITOR_ROLES)
  create(@Body() dto: CreateArticleDto, @CurrentUser() user: AuthenticatedUser) {
    return this.kbService.create(dto, user);
  }

  // GET /kb/articles/:id  — must come before all other :id sub-routes
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.kbService.findOne(id, user);
  }

  // PATCH /kb/articles/:id  (AGENT, L2_L3, IT_ADMIN, SYS_ADMIN)
  @Patch(':id')
  @Roles(...EDITOR_ROLES)
  update(
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.kbService.update(id, dto, user);
  }

  // POST /kb/articles/:id/publish  (IT_ADMIN, SYS_ADMIN only)
  @Post(':id/publish')
  @Roles(...PUBLISH_ROLES)
  publish(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.kbService.publish(id, user);
  }

  // DELETE /kb/articles/:id  (IT_ADMIN, SYS_ADMIN — soft archive)
  @Delete(':id')
  @Roles(...PUBLISH_ROLES)
  archive(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.kbService.archive(id, user);
  }

  // POST /kb/articles/:id/feedback  (any authenticated user)
  @Post(':id/feedback')
  feedback(@Param('id') id: string, @Body() dto: FeedbackDto) {
    return this.kbService.feedback(id, dto);
  }
}
