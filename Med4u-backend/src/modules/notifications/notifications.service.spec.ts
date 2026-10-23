import { NotFoundException } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

describe('NotificationsService', () => {
  const userId = 'patient-user-1';
  const rows = [
    { id: 'notice-1', userId, type: 'prescription_issued', title: 'New prescription available', body: 'Your doctor has issued a prescription. Tap to view it.', data: { prescriptionId: 'rx-1' }, isRead: false, createdAt: new Date('2026-10-23T12:00:00Z') },
    { id: 'notice-2', userId, type: 'appointment_reminder', title: 'Appointment reminder', body: 'You have an appointment soon.', data: null, isRead: true, createdAt: new Date('2026-10-22T12:00:00Z') },
  ];
  const repository = {
    find: jest.fn(async ({ where }: any) => rows.filter((row) => row.userId === where.userId)),
    findOne: jest.fn(async ({ where }: any) => rows.find((row) => row.id === where.id && row.userId === where.userId) ?? null),
    count: jest.fn(async ({ where }: any) => rows.filter((row) => row.userId === where.userId && (where.isRead === undefined || row.isRead === where.isRead)).length),
    save: jest.fn(async (row: any) => row),
  };
  let service: NotificationsService;

  beforeEach(() => {
    jest.clearAllMocks();
    rows[0].isRead = false;
    service = new NotificationsService(repository as any);
  });

  it('lists only notifications owned by the authenticated patient and includes unread count', async () => {
    const page = await service.listMine(userId, 1, 20);
    expect(page.data).toEqual(rows);
    expect(page.unreadCount).toBe(1);
    expect(repository.find).toHaveBeenCalledWith(expect.objectContaining({ where: { userId } }));
  });

  it('counts unread notifications for the current patient', async () => {
    expect(await service.unreadCount(userId)).toEqual({ unreadCount: 1 });
  });

  it('marks a patient notification as read idempotently', async () => {
    await expect(service.markRead(userId, 'notice-1')).resolves.toEqual({ id: 'notice-1', isRead: true });
    expect(rows[0].isRead).toBe(true);
    expect(repository.save).toHaveBeenCalledWith(rows[0]);
    expect(await service.unreadCount(userId)).toEqual({ unreadCount: 0 });
    await service.markRead(userId, 'notice-1');
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('does not expose a notification belonging to another user', async () => {
    await expect(service.markRead('other-patient', 'notice-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('binds listing and marking read to the JWT subject in the controller', async () => {
    const controllerService = {
      listMine: jest.fn().mockResolvedValue({ data: [], meta: {}, unreadCount: 0 }),
      unreadCount: jest.fn().mockResolvedValue({ unreadCount: 0 }),
      markRead: jest.fn().mockResolvedValue({ id: 'notice-1', isRead: true }),
    } as any;
    const controller = new NotificationsController(controllerService);
    await controller.list({ sub: userId } as any, 1, 50);
    await controller.unreadCount({ sub: userId } as any);
    await controller.markRead({ sub: userId } as any, 'notice-1');
    expect(controllerService.listMine).toHaveBeenCalledWith(userId, 1, 50);
    expect(controllerService.unreadCount).toHaveBeenCalledWith(userId);
    expect(controllerService.markRead).toHaveBeenCalledWith(userId, 'notice-1');
  });
});
