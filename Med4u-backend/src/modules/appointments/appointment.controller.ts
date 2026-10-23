import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PaginatedResponse } from '../../common/utils/pagination.util';
import { JwtPayload } from '../../common/types/jwt-payload.types';
import { UserRole } from '../../database/entities/user.entity';
import { Public } from '../../common/decorators/public.decorator';
import { AppointmentService } from './appointment.service';
import { AppointmentResponse } from './appointment.types';
import { CancelAppointmentDto, CancelAppointmentSchema } from './dto/cancel-appointment.dto';
import { CreateAppointmentDto, CreateAppointmentSchema } from './dto/create-appointment.dto';
import {
  ListAppointmentsQueryDto,
  ListAppointmentsQuerySchema,
} from './dto/list-appointments-query.dto';
import {
  CreatePaymentOrderDto,
  CreatePaymentOrderSchema,
  VerifyAppointmentPaymentDto,
  VerifyAppointmentPaymentSchema,
} from './dto/create-payment-order.dto';

/**
 * Every route requires a JWT (global guard). Access is always derived from the token's user id:
 * patients only ever see their own appointments, doctors only those booked with their profile.
 */
@ApiTags('appointments')
@ApiBearerAuth('access-token')
@Controller('v1/appointments')
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Public()
  @Post('payment-webhook')
  @HttpCode(HttpStatus.OK)
  paymentWebhook(
    @Req() request: { rawBody?: Buffer },
    @Headers('x-razorpay-signature') signature?: string,
  ): Promise<{ received: true }> {
    return this.appointmentService.handlePaymentWebhook(request.rawBody, signature);
  }

  @Roles(UserRole.PATIENT)
  @Get('payment-configuration')
  paymentConfiguration() {
    return this.appointmentService.paymentConfiguration();
  }

  @Roles(UserRole.PATIENT)
  @Post('payment-orders')
  @HttpCode(HttpStatus.CREATED)
  createPaymentOrder(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(CreatePaymentOrderSchema)) dto: CreatePaymentOrderDto,
  ) {
    return this.appointmentService.createPaymentOrder(user.sub, dto);
  }

  @Roles(UserRole.PATIENT)
  @Post('demo-bookings')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a no-charge booking for a demo doctor',
    description: 'The server accepts only doctor profiles marked as demo. No payment is collected.',
  })
  createDemoBooking(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(CreateAppointmentSchema)) dto: CreateAppointmentDto,
  ): Promise<AppointmentResponse> {
    return this.appointmentService.createDemoBooking(user.sub, dto);
  }

  @Roles(UserRole.PATIENT)
  @Post(':id/verify-payment')
  @HttpCode(HttpStatus.OK)
  verifyPayment(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(VerifyAppointmentPaymentSchema)) dto: VerifyAppointmentPaymentDto,
  ): Promise<AppointmentResponse> {
    return this.appointmentService.verifyPayment(user.sub, id, dto);
  }

  @Roles(UserRole.PATIENT)
  @Post(':id/cancel-payment')
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancelPaymentReservation(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    await this.appointmentService.cancelPaymentReservation(user.sub, id);
  }

  @Roles(UserRole.PATIENT)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Legacy direct booking disabled',
    description: 'Use POST /v1/appointments/payment-orders so unpaid bookings cannot be confirmed.',
  })
  @ApiResponse({ status: 409, description: 'Payment flow required' })
  create(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(CreateAppointmentSchema)) dto: CreateAppointmentDto,
  ): Promise<AppointmentResponse> {
    void user;
    void dto;
    throw new ConflictException({
      code: 'PAYMENT_FLOW_REQUIRED',
      message: 'Create a payment order to reserve and confirm an appointment.',
    });
  }

  @Get()
  @ApiOperation({ summary: "List the authenticated user's appointments (paginated)" })
  list(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(ListAppointmentsQuerySchema)) query: ListAppointmentsQueryDto,
  ): Promise<PaginatedResponse<AppointmentResponse>> {
    return this.appointmentService.list(user.sub, user.role, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one of your appointments' })
  @ApiResponse({ status: 404, description: 'Not found, or not yours' })
  getOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<AppointmentResponse> {
    return this.appointmentService.getForUser(user.sub, user.role, id);
  }

  @Patch(':id/cancel')
  @ApiOperation({
    summary: 'Cancel an appointment',
    description: 'Allowed for the patient or the doctor until the appointment starts.',
  })
  cancel(
    @CurrentUser() user: JwtPayload,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body(new ZodValidationPipe(CancelAppointmentSchema)) dto: CancelAppointmentDto,
  ): Promise<AppointmentResponse> {
    return this.appointmentService.cancel(user.sub, user.role, id, dto);
  }
}
