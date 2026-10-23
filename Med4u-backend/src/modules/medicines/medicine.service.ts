import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../redis/redis.constants';
import { Variant } from '../../database/entities/variant.entity';
import { Price, PriceSource } from '../../database/entities/price.entity';
import { PaginatedResponse } from '../../common/utils/pagination.util';
import { discountPercent, paiseToRupees, toPaise } from '../../common/utils/money.util';
import { PriceService } from './price.service';
import { ListMedicinesQueryDto } from './dto/list-medicines-query.dto';
import {
  LOW_STOCK_THRESHOLD,
  MAX_ORDER_QUANTITY,
  MedicineCategory,
  MedicineProduct,
  StockStatus,
} from './medicine.types';
import {
  classifyPrescriptionMatches,
  PrescribedMedicineForMatch,
} from './prescription-matching';

const CACHE_TTL = 3600;

/**
 * Joins only the most recently updated price of a variant, so a product that has prices from
 * several sources still appears exactly once, with one unambiguous price.
 */
const LATEST_PRICE_JOIN =
  'p.deletedAt IS NULL AND p.id = (' +
  'SELECT p2.id FROM prices p2 WHERE p2.variant_id = v.id AND p2.deleted_at IS NULL ' +
  'ORDER BY p2.last_updated DESC, p2.id DESC LIMIT 1)';

interface PriceShape {
  mrp: number;
  final_price: number;
  discount_percent: number;
  source: string;
}

export interface MedicineSearchResult {
  generic: string;
  brand: string;
  strength: string | null;
  form: string;
  pack_size: string | null;
  price: PriceShape | null;
}

/** Integer-paise view of a product, used by order pricing. Never sent to clients. */
export interface PricedProduct {
  product: MedicineProduct;
  stockQuantity: number;
  mrpPaise: number;
  sellingPaise: number;
}

@Injectable()
export class MedicineService {
  constructor(
    @InjectRepository(Variant) private variantRepo: Repository<Variant>,
    @InjectRepository(Price) private priceRepo: Repository<Price>,
    @Inject(REDIS_CLIENT) private redis: Redis,
    private priceService: PriceService,
  ) {}

  // ── GET /api/v1/medicines ─────────────────────────────────────────────────

  async list(query: ListMedicinesQueryDto): Promise<PaginatedResponse<MedicineProduct>> {
    const qb = this.catalogQuery(this.variantRepo);

    if (query.search) {
      const escaped = query.search.toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
      qb.andWhere(
        '(LOWER(b.name) LIKE :q OR LOWER(g.name) LIKE :q OR LOWER(b.manufacturer) LIKE :q OR LOWER(g.category) LIKE :q)',
        { q: `%${escaped}%` },
      );
    }
    if (query.category) {
      qb.andWhere('LOWER(g.category) = :category', { category: query.category.toLowerCase() });
    }
    if (query.requiresPrescription !== undefined) {
      qb.andWhere('b.requiresPrescription = :rx', { rx: query.requiresPrescription });
    }
    if (query.inStock) {
      qb.andWhere('v.stockQuantity > 0');
    }

    // Whitelisted sort keys only; user input never reaches ORDER BY.
    switch (query.sortBy) {
      case 'price_asc':
        qb.orderBy('p.finalPrice', 'ASC', 'NULLS LAST');
        break;
      case 'price_desc':
        qb.orderBy('p.finalPrice', 'DESC', 'NULLS LAST');
        break;
      default:
        qb.orderBy('b.name', 'ASC');
    }
    qb.addOrderBy('v.id', 'ASC');

    const [variants, total] = await qb
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();

    return new PaginatedResponse(
      variants.map((v) => this.toProduct(v)),
      total,
      query.page,
      query.limit,
    );
  }

  // ── GET /api/v1/medicines/categories ──────────────────────────────────────

  async listCategories(): Promise<MedicineCategory[]> {
    const rows = await this.variantRepo
      .createQueryBuilder('v')
      .innerJoin('v.medicine', 'b')
      .innerJoin('b.generic', 'g')
      .select('g.category', 'category')
      .addSelect('COUNT(v.id)', 'count')
      .where('v.deletedAt IS NULL')
      .andWhere('b.deletedAt IS NULL')
      .andWhere('b.isActive = true')
      .andWhere('g.deletedAt IS NULL')
      .groupBy('g.category')
      .orderBy('g.category', 'ASC')
      .getRawMany<{ category: string; count: string }>();
    return rows.map((r) => ({ category: r.category, count: Number(r.count) }));
  }

  // ── GET /api/v1/medicines/:id ─────────────────────────────────────────────

  async getById(id: string): Promise<MedicineProduct> {
    const variant = await this.catalogQuery(this.variantRepo)
      .andWhere('v.id = :id', { id })
      .getOne();
    if (!variant) {
      throw new NotFoundException({ code: 'MEDICINE_NOT_FOUND', message: 'Medicine not found.' });
    }
    return this.toProduct(variant);
  }

  /** Exact, catalog-backed product matches for issued prescription lines. Never picks substitutes automatically. */
  async matchPrescription(medicines: PrescribedMedicineForMatch[]) {
    return Promise.all(medicines.map(async (medicine, index) => {
      const qb = this.catalogQuery(this.variantRepo);
      if (medicine.catalogMedicineId) {
        qb.andWhere('v.id = :variantId', { variantId: medicine.catalogMedicineId });
      } else {
        const ingredient = (medicine.genericName || medicine.name).trim().toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
        const brand = medicine.name.trim().toLowerCase().replace(/[\\%_]/g, (c) => `\\${c}`);
        qb.andWhere('(LOWER(g.name) = :ingredient OR LOWER(b.name) = :brand)', { ingredient, brand });
      }
      const variants = await qb.orderBy('b.name', 'ASC').addOrderBy('v.id', 'ASC').take(100).getMany();
      const products = variants.map((v) => this.toProduct(v));
      const matched = classifyPrescriptionMatches(medicine, products);
      return {
        prescriptionMedicineIndex: index,
        prescriptionMedicine: medicine,
        status: matched.status,
        candidates: matched.candidates,
      };
    }));
  }

  /**
   * Trusted, integer-paise product data for checkout. Runs on the caller's transaction so the
   * price and stock it returns are the ones the order is written against.
   */
  async findForPurchase(em: EntityManager, ids: string[]): Promise<Map<string, PricedProduct>> {
    const variants = await this.catalogQuery(em.getRepository(Variant))
      .andWhere('v.id IN (:...ids)', { ids })
      .getMany();
    const result = new Map<string, PricedProduct>();
    for (const v of variants) {
      const price = v.prices?.[0];
      result.set(v.id, {
        product: this.toProduct(v),
        stockQuantity: v.stockQuantity,
        mrpPaise: price ? toPaise(price.mrp as unknown as string) : 0,
        sellingPaise: price ? toPaise(price.finalPrice as unknown as string) : 0,
      });
    }
    return result;
  }

  // ── Legacy name search: GET /api/medicines/search?name= ───────────────────

  async search(name: string): Promise<MedicineSearchResult[]> {
    const query = name.trim().toLowerCase();
    const cacheKey = `medicine:${query}`;

    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as MedicineSearchResult[];

    const escaped = query.replace(/[\\%_]/g, (c) => `\\${c}`);
    const variants = await this.variantRepo
      .createQueryBuilder('variant')
      .innerJoinAndSelect('variant.medicine', 'brand')
      .innerJoinAndSelect('brand.generic', 'generic')
      .leftJoinAndSelect('variant.prices', 'price')
      .where('variant.deletedAt IS NULL')
      .andWhere('brand.deletedAt IS NULL')
      .andWhere('brand.isActive = true')
      .andWhere('generic.deletedAt IS NULL')
      .andWhere('(LOWER(brand.name) LIKE :q OR LOWER(generic.name) LIKE :q)', {
        q: `%${escaped}%`,
      })
      .orderBy('brand.name', 'ASC')
      .getMany();

    // Optimistically fetch prices from myUpchar for variants that have no price yet
    const missingPrice = variants.filter((v) => !v.prices || v.prices.length === 0);
    if (missingPrice.length > 0) {
      await Promise.allSettled(
        missingPrice.map(async (v) => {
          try {
            await this.priceService.fetchAndStore(v.medicine.name, v.id);
          } catch {
            // non-fatal — fall back to DB-only result
          }
        }),
      );

      const ids = missingPrice.map((v) => v.id);
      const refreshed = await this.priceRepo.find({
        where: ids.map((id) => ({ variantId: id })),
      });
      const priceMap = new Map(refreshed.map((p) => [p.variantId, p]));

      for (const v of missingPrice) {
        const p = priceMap.get(v.id);
        if (p) v.prices = [p];
      }
    }

    const results: MedicineSearchResult[] = variants.map((v) => {
      const latestPrice = v.prices?.[0] ?? null;
      return {
        generic: v.medicine.generic.name,
        brand: v.medicine.name,
        strength: v.strength ?? null,
        form: v.form,
        pack_size: v.packSize ?? null,
        price: latestPrice
          ? {
              mrp: Number(latestPrice.mrp),
              final_price: Number(latestPrice.finalPrice),
              discount_percent: Number(latestPrice.discountPercent),
              source: latestPrice.source,
            }
          : null,
      };
    });

    await this.redis.setex(cacheKey, CACHE_TTL, JSON.stringify(results));
    return results;
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private catalogQuery(repo: Repository<Variant>): SelectQueryBuilder<Variant> {
    return repo
      .createQueryBuilder('v')
      .innerJoinAndSelect('v.medicine', 'b')
      .innerJoinAndSelect('b.generic', 'g')
      .leftJoinAndSelect('v.prices', 'p', LATEST_PRICE_JOIN)
      .where('v.deletedAt IS NULL')
      .andWhere('b.deletedAt IS NULL')
      .andWhere('b.isActive = true')
      .andWhere('g.deletedAt IS NULL');
  }

  private toProduct(v: Variant): MedicineProduct {
    const b = v.medicine;
    const price = v.prices?.[0];

    let productPrice: MedicineProduct['price'] = null;
    if (price) {
      const mrp = toPaise(price.mrp as unknown as string);
      const selling = toPaise(price.finalPrice as unknown as string);
      productPrice = {
        mrp: paiseToRupees(mrp),
        sellingPrice: paiseToRupees(selling),
        discountPercent: discountPercent(mrp, selling),
        source: price.source,
        isEstimate: price.source === PriceSource.DEMO_ESTIMATE,
        updatedAt: new Date(price.lastUpdated).toISOString(),
      };
    }

    const stock = Math.max(0, v.stockQuantity);
    const stockStatus: StockStatus =
      stock === 0 ? 'OUT_OF_STOCK' : stock <= LOW_STOCK_THRESHOLD ? 'LOW_STOCK' : 'IN_STOCK';

    return {
      id: v.id,
      brandId: b.id,
      name: b.name,
      genericName: b.generic.name,
      category: b.generic.category,
      manufacturer: b.manufacturer ?? null,
      strength: v.strength ?? null,
      form: v.form,
      packSize: v.packSize ?? null,
      description: b.description ?? b.generic.description ?? null,
      imageUrl: b.imageUrl ?? null,
      requiresPrescription: b.requiresPrescription,
      isDemo: b.isDemo,
      stockStatus,
      maxOrderQuantity: Math.min(stock, MAX_ORDER_QUANTITY),
      purchasable: stock > 0 && productPrice !== null,
      price: productPrice,
    };
  }
}
