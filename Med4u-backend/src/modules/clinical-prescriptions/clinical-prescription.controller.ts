import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PaginatedResponse } from '../../common/utils/pagination.util';
import { JwtPayload } from '../../common/types/jwt-payload.types';
import { UserRole } from '../../database/entities/user.entity';
import { ClinicalPrescriptionService } from './clinical-prescription.service';
import {
  AmendPrescriptionDto,
  AmendPrescriptionSchema,
  CancelPrescriptionDto,
  CancelPrescriptionSchema,
  IssuePrescriptionDto,
  IssuePrescriptionSchema,
  ListMyClinicalPrescriptionsQueryDto,
  ListMyClinicalPrescriptionsQuerySchema,
  SaveDraftDto,
  SaveDraftSchema,
  RegisterPushTokenDto,
  RegisterPushTokenSchema,
  SearchPrescriptionLabTestsDto,
  SearchPrescriptionLabTestsSchema,
} from './dto/clinical-prescription.dto';
import {
  AppointmentPrescriptionState,
  DoctorPrescriptionView,
  IssueResult,
  PatientPrescriptionView,
  PrescriptionHistoryEntry,
} from './clinical-prescription.types';

const uuid = () => new ParseUUIDPipe({ version: '4' });

/**
 * Doctor-side prescription workflow. The doctor is always the authenticated user: no endpoint accepts a doctor,
 * patient or role from the client, and ids that do not belong to this doctor answer 404.
 */
@ApiTags('clinical-prescriptions')
@ApiBearerAuth('access-token')
@Roles(UserRole.DOCTOR)
@Controller('v1/doctor')
export class DoctorPrescriptionController {
  constructor(private readonly service: ClinicalPrescriptionService) {}

  @Get('lab-tests')
  @ApiOperation({ summary: 'Search active catalog tests for prescription recommendations' })
  searchLabTests(
    @Query(new ZodValidationPipe(SearchPrescriptionLabTestsSchema)) query: SearchPrescriptionLabTestsDto,
  ) {
    return this.service.searchLabTests(query);
  }

  @Get('appointments/:appointmentId/prescription')
  @ApiOperation({
    summary: 'Prescription eligibility, open draft and issued prescription for an appointment',
  })
  state(
    @CurrentUser() user: JwtPayload,
    @Param('appointmentId', uuid()) appointmentId: string,
  ): Promise<AppointmentPrescriptionState> {
    return this.service.getStateForAppointment(user.sub, appointmentId);
  }

  @Put('appointments/:appointmentId/prescription/draft')
  @ApiOperation({
    summary: 'Create or update the draft prescription',
    description: 'Idempotent. A draft is never visible to the patient.',
  })
  saveDraft(
    @CurrentUser() user: JwtPayload,
    @Param('appointmentId', uuid()) appointmentId: string,
    @Body(new ZodValidationPipe(SaveDraftSchema)) dto: SaveDraftDto,
  ): Promise<DoctorPrescriptionView> {
    return this.service.saveDraft(user.sub, appointmentId, dto);
  }

  @Get('prescriptions/:id')
  getOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', uuid()) id: string,
  ): Promise<DoctorPrescriptionView> {
    return this.service.getForDoctor(user.sub, id);
  }

  @Get('prescriptions/:id/history')
  @ApiOperation({ summary: 'Audit history for the prescription and its amendments' })
  history(
    @CurrentUser() user: JwtPayload,
    @Param('id', uuid()) id: string,
  ): Promise<PrescriptionHistoryEntry[]> {
    return this.service.historyForDoctor(user.sub, id);
  }

  @Delete('prescriptions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Discard a draft (issued prescriptions cannot be deleted)' })
  async discard(@CurrentUser() user: JwtPayload, @Param('id', uuid()) id: string): Promise<void> {
    await this.service.discardDraft(user.sub, id);
  }

  @Post('prescriptions/:id/issue')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Issue a reviewed draft',
    description:
      'Send the `revision` you reviewed. Repeating a completed request returns the same prescription with `alreadyIssued: true`.',
  })
  issue(
    @CurrentUser() user: JwtPayload,
    @Param('id', uuid()) id: string,
    @Body(new ZodValidationPipe(IssuePrescriptionSchema)) dto: IssuePrescriptionDto,
  ): Promise<IssueResult> {
    return this.service.issue(user.sub, id, dto);
  }

  @Post('prescriptions/:id/amend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Start a correction of an issued prescription (creates a linked draft)',
  })
  amend(
    @CurrentUser() user: JwtPayload,
    @Param('id', uuid()) id: string,
    @Body(new ZodValidationPipe(AmendPrescriptionSchema)) dto: AmendPrescriptionDto,
  ): Promise<DoctorPrescriptionView> {
    return this.service.amend(user.sub, id, dto);
  }

  @Post('prescriptions/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an issued prescription (the record is kept)' })
  cancel(
    @CurrentUser() user: JwtPayload,
    @Param('id', uuid()) id: string,
    @Body(new ZodValidationPipe(CancelPrescriptionSchema)) dto: CancelPrescriptionDto,
  ): Promise<DoctorPrescriptionView> {
    return this.service.cancel(user.sub, id, dto);
  }
}

/** The authenticated patient's own doctor-issued prescriptions. Ownership comes from the token, never the URL. */
@ApiTags('clinical-prescriptions')
@ApiBearerAuth('access-token')
@Roles(UserRole.PATIENT)
@Controller('v1/patient/prescriptions')
export class PatientPrescriptionController {
  constructor(private readonly service: ClinicalPrescriptionService) {}

  @Post('push-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  registerPushToken(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(RegisterPushTokenSchema)) dto: RegisterPushTokenDto,
  ): Promise<void> {
    return this.service.registerPushToken(user.sub, dto);
  }

  @Delete('push-token/:deviceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removePushToken(@CurrentUser() user: JwtPayload, @Param('deviceId') deviceId: string): Promise<void> {
    return this.service.removePushToken(user.sub, deviceId);
  }

  @Get()
  @ApiOperation({ summary: "List the authenticated patient's issued prescriptions (never drafts)" })
  list(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(ListMyClinicalPrescriptionsQuerySchema))
    query: ListMyClinicalPrescriptionsQueryDto,
  ): Promise<PaginatedResponse<PatientPrescriptionView>> {
    return this.service.listMine(user.sub, query);
  }

  @Get(':id')
  getOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', uuid()) id: string,
  ): Promise<PatientPrescriptionView> {
    return this.service.getMine(user.sub, id);
  }

  @Get(':id/medicine-order-options')
  @ApiOperation({ summary: 'Match an issued prescription to current purchasable catalog products' })
  medicineOrderOptions(@CurrentUser() user: JwtPayload, @Param('id', uuid()) id: string) {
    return this.service.medicineOrderOptions(user.sub, id);
  }
}
