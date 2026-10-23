import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PaginatedResponse } from '../../common/utils/pagination.util';
import { JwtPayload } from '../../common/types/jwt-payload.types';
import { UserRole } from '../../database/entities/user.entity';
import { OrderService } from './order.service';
import { StaffOrderResponse } from './order.types';
import {
  StaffListOrdersQueryDto,
  StaffListOrdersQuerySchema,
  UpdateOrderStatusDto,
  UpdateOrderStatusSchema,
} from './dto/create-order.dto';

/** Pharmacy back office. Patients and doctors are rejected by the role guard. */
@ApiTags('pharmacy')
@ApiBearerAuth('access-token')
@Roles(UserRole.PHARMACIST, UserRole.ADMIN)
@Controller('v1/pharmacy/orders')
export class PharmacyOrderController {
  constructor(private readonly orderService: OrderService) {}

  @Get()
  @ApiOperation({ summary: 'List all orders, oldest first, optionally by status' })
  list(
    @Query(new ZodValidationPipe(StaffListOrdersQuerySchema)) query: StaffListOrdersQueryDto,
  ): Promise<PaginatedResponse<StaffOrderResponse>> {
    return this.orderService.staffList(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get any order with customer, prescription status and audit history' })
  getOne(@Param('id', ParseUUIDPipe) id: string): Promise<StaffOrderResponse> {
    return this.orderService.staffGet(id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Advance or cancel an order',
    description:
      'Only pharmacists and admins can use this route. For a current doctor-issued prescription, confirming a PENDING_REVIEW order is the pharmacist approval action and is recorded in order history. ' +
      'Uploaded prescriptions still require approval through the prescription review endpoint. Prescription-only orders cannot otherwise leave PENDING_REVIEW (422 PRESCRIPTION_APPROVAL_REQUIRED). ' +
      'For CANCELLED the note is shown to the customer as the cancellation reason; otherwise it is internal.',
  })
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(UpdateOrderStatusSchema)) dto: UpdateOrderStatusDto,
  ): Promise<StaffOrderResponse> {
    return this.orderService.staffUpdateStatus({ id: user.sub, role: user.role }, id, dto);
  }
}
