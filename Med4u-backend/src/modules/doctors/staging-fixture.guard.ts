import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Doctor } from '../../database/entities/doctor.entity';

/**
 * Staging test doctors must never exist in a production database. With NODE_ENV=production the app
 * refuses to finish starting if any such row is present, instead of silently serving fictional doctors.
 */
@Injectable()
export class StagingFixtureGuard implements OnApplicationBootstrap {
  constructor(@InjectRepository(Doctor) private readonly doctors: Repository<Doctor>) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.assertNoFixturesInProduction(process.env.NODE_ENV);
  }

  async assertNoFixturesInProduction(nodeEnv: string | undefined): Promise<void> {
    if (nodeEnv !== 'production') return;
    const count = await this.doctors.count({ where: { isStagingFixture: true }, withDeleted: true });
    if (count > 0) {
      throw new Error(
        `Refusing to start: ${count} staging test doctor row(s) exist in this database. ` +
          'Staging fixtures must never be present in production.',
      );
    }
  }
}
