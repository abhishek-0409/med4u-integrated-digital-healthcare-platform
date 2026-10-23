import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtPayload } from '../../common/types/jwt-payload.types';
import { UserRole } from '../../database/entities/user.entity';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth('access-token')
@Roles(UserRole.PATIENT)
@Controller('v1/patient/notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: "List the authenticated patient's in-app notifications" })
  list(
    @CurrentUser() user: JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.service.listMine(user.sub, page, limit);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get the authenticated patient’s unread notification count' })
  unreadCount(@CurrentUser() user: JwtPayload) {
    return this.service.unreadCount(user.sub);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one of the authenticated patient’s notifications as read' })
  markRead(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.markRead(user.sub, id);
  }
}
