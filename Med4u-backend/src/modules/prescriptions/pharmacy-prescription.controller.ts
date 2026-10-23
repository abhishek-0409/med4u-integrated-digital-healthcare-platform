import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PaginatedResponse } from '../../common/utils/pagination.util';
import { JwtPayload } from '../../common/types/jwt-payload.types';
import { UserRole } from '../../database/entities/user.entity';
import {
  RejectPrescriptionDto,
  RejectPrescriptionSchema,
  ReviewQueueQueryDto,
  ReviewQueueQuerySchema,
} from './dto/prescription.dto';
import { PrescriptionService } from './prescription.service';
import { ReviewQueueItem } from './prescription.types';

/** Pharmacist review queue. The file itself is fetched from GET /v1/prescription-uploads/:id/file. */
@ApiTags('pharmacy')
@ApiBearerAuth('access-token')
@Roles(UserRole.PHARMACIST, UserRole.ADMIN)
@Controller('v1/pharmacy/prescriptions')
export class PharmacyPrescriptionController {
  constructor(private readonly prescriptions: PrescriptionService) {}

  @Get()
  @ApiOperation({
    summary: 'Prescription review queue',
    description:
      'status=PENDING (default) lists prescriptions attached to a live order, oldest first. ' +
      'APPROVED / REJECTED list the review history, newest first.',
  })
  queue(
    @Query(new ZodValidationPipe(ReviewQueueQuerySchema)) query: ReviewQueueQueryDto,
  ): Promise<PaginatedResponse<ReviewQueueItem>> {
    return this.prescriptions.reviewQueue(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One prescription with the order it is reviewed against' })
  getOne(@Param('id', ParseUUIDPipe) id: string): Promise<ReviewQueueItem> {
    return this.prescriptions.getForReview(id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve a prescription and release its order',
    description:
      'Records the reviewer and time, and moves the order from PENDING_REVIEW to CONFIRMED. ' +
      'Approval records that a pharmacist reviewed the document; it is not an authenticity check.',
  })
  approve(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ReviewQueueItem> {
    return this.prescriptions.approve({ id: user.sub, role: user.role }, id);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject a prescription',
    description:
      'Picks a fixed reason (plus an optional short note shown to the patient), cancels the order and returns its stock.',
  })
  reject(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RejectPrescriptionSchema)) dto: RejectPrescriptionDto,
  ): Promise<ReviewQueueItem> {
    return this.prescriptions.reject({ id: user.sub, role: user.role }, id, dto);
  }
}
