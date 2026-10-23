import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Price, PriceSource } from '../../database/entities/price.entity';

interface MyUpcharPriceResponse {
  mrp: number;
  final_price: number;
  discount_perc: number;
}

@Injectable()
export class PriceService {
  private readonly logger = new Logger(PriceService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    @InjectRepository(Price) private priceRepo: Repository<Price>,
    private config: ConfigService,
  ) {
    this.baseUrl = this.config.get<string>('MYUPCHAR_BASE_URL', 'https://api.myupchar.com/v1');
    this.apiKey = this.config.get<string>('MYUPCHAR_API_KEY', '');
  }

  async fetchAndStore(medicineName: string, variantId: string): Promise<Price | null> {
    const priceData = await this.fetchFromMyUpchar(medicineName);
    if (!priceData) return null;
    return this.upsertPrice(variantId, priceData);
  }

  async upsertPrice(
    variantId: string,
    data: { mrp: number; finalPrice: number; discountPercent: number },
  ): Promise<Price> {
    const existing = await this.priceRepo.findOne({
      where: { variantId, source: PriceSource.MYUPCHAR },
    });

    if (existing) {
      existing.mrp = data.mrp;
      existing.finalPrice = data.finalPrice;
      existing.discountPercent = data.discountPercent;
      existing.lastUpdated = new Date();
      return this.priceRepo.save(existing);
    }

    return this.priceRepo.save(
      this.priceRepo.create({
        variantId,
        mrp: data.mrp,
        finalPrice: data.finalPrice,
        discountPercent: data.discountPercent,
        source: PriceSource.MYUPCHAR,
        lastUpdated: new Date(),
      }),
    );
  }

  private async fetchFromMyUpchar(medicineName: string): Promise<{
    mrp: number;
    finalPrice: number;
    discountPercent: number;
  } | null> {
    if (!this.apiKey) return null;

    try {
      const response = await axios.get<MyUpcharPriceResponse>(
        `${this.baseUrl}/medicine/price`,
        {
          params: { name: medicineName },
          headers: { 'x-api-key': this.apiKey },
          timeout: 5000,
        },
      );

      const { mrp, final_price, discount_perc } = response.data;
      return { mrp, finalPrice: final_price, discountPercent: discount_perc };
    } catch (err) {
      this.logger.warn(`myUpchar price fetch failed for "${medicineName}": ${(err as Error).message}`);
      return null;
    }
  }
}
