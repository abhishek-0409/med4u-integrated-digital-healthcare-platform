import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { DEMO_EMAIL_DOMAIN, DEMO_VIDEO_PATIENT_EMAIL } from './demo-doctor';

/**
 * Demo accounts must never exist in a production database. With NODE_ENV=production the app refuses to
 * finish starting if any is present, instead of silently serving a synthetic doctor.
 */
@Injectable()
export class DemoAccountGuard implements OnApplicationBootstrap {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.assertNoDemoAccountsInProduction(process.env.NODE_ENV);
  }

  async assertNoDemoAccountsInProduction(nodeEnv: string | undefined): Promise<void> {
    if (nodeEnv !== 'production') return;
    const count = await this.users.count({
      where: [{ email: Like(`%${DEMO_EMAIL_DOMAIN}`) }, { email: DEMO_VIDEO_PATIENT_EMAIL }],
      withDeleted: true,
    });
    if (count > 0) {
      throw new Error(
        `Refusing to start: ${count} demo account(s) exist in this database. Demo accounts must never be present in production.`,
      );
    }
  }
}
