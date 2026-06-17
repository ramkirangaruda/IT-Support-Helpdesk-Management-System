import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/auth.types';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** GET /api/notifications/me — recent in-app notifications for the signed-in user */
  @Get('me')
  listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ) {
    const lim = limit ? parseInt(limit, 10) : 15;
    return this.notifications.listForUser(user.email, lim);
  }
}
