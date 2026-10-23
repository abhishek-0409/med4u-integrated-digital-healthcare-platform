import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from '../../database/entities/notification.entity';
import { PaginatedResponse, getPaginationParams } from '../../common/utils/pagination.util';

@Injectable()
export class NotificationsService {
  constructor(@InjectRepository(Notification) private readonly notifications: Repository<Notification>) {}

  async listMine(userId: string, page = 1, limit = 50) {
    const pagination = getPaginationParams({ page, limit });
    const [data, total, unreadCount] = await Promise.all([
      this.notifications.find({
        where: { userId },
        order: { createdAt: 'DESC' },
        skip: pagination.skip,
        take: pagination.limit,
      }),
      this.notifications.count({ where: { userId } }),
      this.notifications.count({ where: { userId, isRead: false } }),
    ]);
    return { ...new PaginatedResponse(data, total, pagination.page, pagination.limit), unreadCount };
  }

  async unreadCount(userId: string): Promise<{ unreadCount: number }> {
    return { unreadCount: await this.notifications.count({ where: { userId, isRead: false } }) };
  }

  async markRead(userId: string, id: string): Promise<{ id: string; isRead: true }> {
    const notification = await this.notifications.findOne({ where: { id, userId } });
    if (!notification) throw new NotFoundException('Notification not found.');
    if (!notification.isRead) {
      notification.isRead = true;
      await this.notifications.save(notification);
    }
    return { id, isRead: true };
  }
}
