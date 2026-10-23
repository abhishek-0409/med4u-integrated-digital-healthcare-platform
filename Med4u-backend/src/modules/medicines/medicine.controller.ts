import {
  BadRequestException,
  Controller,
  Get,
  Logger,
  Param,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PaginatedResponse } from '../../common/utils/pagination.util';
import { MedicineService, MedicineSearchResult } from './medicine.service';
import { MedicineCategory, MedicineProduct } from './medicine.types';
import { ListMedicinesQueryDto, ListMedicinesQuerySchema } from './dto/list-medicines-query.dto';

/**
 * The catalog is public (browse-only). Ordering lives in the orders module and requires a login;
 * prescription and stock rules are enforced there, never in the client.
 */
@ApiTags('Medicines')
@Controller(['v1/medicines', 'medicines'])
export class MedicineController {
  private readonly logger = new Logger(MedicineController.name);

  constructor(private readonly medicineService: MedicineService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List catalog products with search, filters, sorting and pagination' })
  @ApiResponse({ status: 200, description: 'Paginated product list' })
  list(
    @Query(new ZodValidationPipe(ListMedicinesQuerySchema)) query: ListMedicinesQueryDto,
  ): Promise<PaginatedResponse<MedicineProduct>> {
    return this.medicineService.list(query);
  }

  // Declared before ':id' so "categories" is never parsed as an id.
  @Public()
  @Get('categories')
  @ApiOperation({ summary: 'Catalog categories with product counts' })
  categories(): Promise<MedicineCategory[]> {
    return this.medicineService.listCategories();
  }

  @Public()
  @Get('search')
  @ApiOperation({ summary: 'Search medicines by brand or generic name (legacy)' })
  @ApiQuery({ name: 'name', required: true, description: 'Brand or generic name to search' })
  async search(@Query('name') name: string): Promise<MedicineSearchResult[]> {
    if (!name || name.trim().length < 2) {
      throw new BadRequestException('Query param "name" must be at least 2 characters');
    }
    this.logger.log(`GET /medicines/search name="${name}"`);
    return this.medicineService.search(name);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get one catalog product' })
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<MedicineProduct> {
    return this.medicineService.getById(id);
  }
}
