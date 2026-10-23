import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PaginatedResponse } from '../../common/utils/pagination.util';
import { JwtPayload } from '../../common/types/jwt-payload.types';
import { UserRole } from '../../database/entities/user.entity';
import { OrderService } from './order.service';
import { OrderResponse, QuoteResponse } from './order.types';
import {
  CancelOrderDto,
  CancelOrderSchema,
  CreateOrderDto,
  CreateOrderSchema,
  ListOrdersQueryDto,
  ListOrdersQuerySchema,
  QuoteDto,
  QuoteSchema,
} from './dto/create-order.dto';

/** Every route requires a patient JWT; a user can only ever read or change their own orders. */
@ApiTags('orders')
@ApiBearerAuth('access-token')
@Roles(UserRole.PATIENT)
@Controller('v1/orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  @Post('quote')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Price and check a cart (no reservation, no side effects)',
    description:
      'Returns current catalog prices, stock problems per line and the server-computed total. ' +
      'Checkout recalculates everything again.',
  })
  quote(@Body(new ZodValidationPipe(QuoteSchema)) dto: QuoteDto): Promise<QuoteResponse> {
    return this.orderService.quote(dto);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Place a pharmacy order',
    description:
      'Prices are always taken from the catalog; any price in the request is rejected. ' +
      '`expectedTotal` is only a confirmation of what the customer saw: a mismatch returns 409 PRICE_CHANGED. ' +
      'Prescription-only items need either `prescriptionId` (own pending upload) or `clinicalPrescriptionId` (own current issued doctor prescription); doctor-prescription orders wait for pharmacist review in PENDING_REVIEW. ' +
      '409 INSUFFICIENT_STOCK / MEDICINE_UNAVAILABLE / PRICE_CHANGED; 422 PRESCRIPTION_*. ' +
      'No payment is collected: the order is UNPAID.',
  })
  @ApiResponse({ status: 201, description: 'Order placed' })
  create(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(CreateOrderSchema)) dto: CreateOrderDto,
  ): Promise<OrderResponse> {
    return this.orderService.create(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: "List the authenticated user's orders (newest first)" })
  list(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(ListOrdersQuerySchema)) query: ListOrdersQueryDto,
  ): Promise<PaginatedResponse<OrderResponse>> {
    return this.orderService.list(user.sub, query);
  }

  @Get(':id')
  @ApiOperation({ summary: "Get one of the authenticated user's orders" })
  getOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<OrderResponse> {
    return this.orderService.getOne(user.sub, id);
  }

  @Patch(':id/cancel')
  @ApiOperation({
    summary: 'Cancel an order and return its stock',
    description:
      'Allowed until the pharmacy starts processing the order (409 ORDER_NOT_CANCELLABLE after).',
  })
  cancel(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(CancelOrderSchema)) dto: CancelOrderDto,
  ): Promise<OrderResponse> {
    return this.orderService.cancel(user.sub, id, dto);
  }
}
