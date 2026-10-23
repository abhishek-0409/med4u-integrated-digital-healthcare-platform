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
  Res,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JwtPayload } from '../../common/types/jwt-payload.types';
import { PaginatedResponse } from '../../common/utils/pagination.util';
import { UserRole } from '../../database/entities/user.entity';
import { MAX_DOCUMENT_BYTES } from './application-document.util';
import {
  ApplicationFieldsDto,
  ApplicationFieldsSchema,
  ApproveApplicationDto,
  ApproveApplicationSchema,
  ListApplicationsQueryDto,
  ListApplicationsQuerySchema,
  RejectApplicationDto,
  RejectApplicationSchema,
  RequestInfoDto,
  RequestInfoSchema,
  ResubmitFieldsDto,
  ResubmitFieldsSchema,
} from './dto/doctor-application.dto';
import {
  AdminApplicationDetail,
  AdminApplicationSummary,
  ApplicantApplicationView,
  DoctorApplicationService,
  UploadedDocs,
} from './doctor-application.service';

const FILE_FIELDS = [
  { name: 'graduationCertificate', maxCount: 1 },
  { name: 'registrationCertificate', maxCount: 1 },
];

const uploadInterceptor = () =>
  FileFieldsInterceptor(FILE_FIELDS, {
    storage: memoryStorage(),
    limits: { fileSize: MAX_DOCUMENT_BYTES, files: 2, fields: 16, fieldSize: 2048, parts: 20 },
  });

type MulterFields = Partial<Record<keyof UploadedDocs, Express.Multer.File[]>>;

/** FileFieldsInterceptor yields arrays per field; each field here holds at most one file. */
const firstFiles = (files: MulterFields | undefined): UploadedDocs => ({
  graduationCertificate: files?.graduationCertificate?.[0],
  registrationCertificate: files?.registrationCertificate?.[0],
});

function sendDocument(res: Response, file: { data: Buffer; mimeType: string; kind: string }): void {
  const ext = file.mimeType === 'application/pdf' ? 'pdf' : file.mimeType === 'image/png' ? 'png' : 'jpg';
  res
    .status(HttpStatus.OK)
    .set({
      'Content-Type': file.mimeType,
      'Content-Length': String(file.data.length),
      // Fixed, generated name: nothing user-controlled reaches a header.
      'Content-Disposition': `attachment; filename="${file.kind.toLowerCase()}.${ext}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    })
    .end(file.data);
}

/** The applicant's own application. Ownership comes only from the JWT; no id of the owner is ever accepted. */
@ApiTags('doctor-applications')
@ApiBearerAuth('access-token')
@Controller('v1/doctor-applications')
export class DoctorApplicationController {
  constructor(private readonly applications: DoctorApplicationService) {}

  @Post()
  @Roles(UserRole.PATIENT)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit a doctor application (multipart)',
    description:
      'Fields plus two files: graduationCertificate and registrationCertificate (PDF/JPEG/PNG, max 5 MB each). ' +
      'Creates a PENDING_VERIFICATION application with a 24-hour review target. It never approves anything.',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(uploadInterceptor())
  submit(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(ApplicationFieldsSchema)) fields: ApplicationFieldsDto,
    @UploadedFiles() files: MulterFields | undefined,
  ): Promise<ApplicantApplicationView> {
    return this.applications.submit(user.sub, fields, firstFiles(files));
  }

  // Doctors are allowed too so an approved applicant can still read the final status.
  @Get('me')
  @Roles(UserRole.PATIENT, UserRole.DOCTOR)
  @ApiOperation({ summary: 'Your own application and its verification status' })
  getMine(@CurrentUser() user: JwtPayload): Promise<ApplicantApplicationView> {
    return this.applications.getMine(user.sub);
  }

  @Post('me/resubmit')
  @Roles(UserRole.PATIENT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resubmit after "more information needed" (or an allowed rejection)',
    description: 'Any subset of fields and/or replacement documents. Restarts the 24-hour review target.',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(uploadInterceptor())
  resubmit(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(ResubmitFieldsSchema)) fields: ResubmitFieldsDto,
    @UploadedFiles() files: MulterFields | undefined,
  ): Promise<ApplicantApplicationView> {
    return this.applications.resubmit(user.sub, fields, firstFiles(files));
  }

  @Get('me/documents/:documentId')
  @Roles(UserRole.PATIENT, UserRole.DOCTOR)
  @ApiOperation({ summary: 'Download one of your own application documents' })
  async ownDocument(
    @CurrentUser() user: JwtPayload,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Res() res: Response,
  ): Promise<void> {
    sendDocument(res, await this.applications.readOwnDocument(user.sub, documentId));
  }
}

/** Reviewer workflow. ADMIN only; the service additionally refuses a reviewer acting on their own application. */
@ApiTags('admin-doctor-applications')
@ApiBearerAuth('access-token')
@Roles(UserRole.ADMIN)
@Controller('v1/admin/doctor-applications')
export class AdminDoctorApplicationController {
  constructor(private readonly applications: DoctorApplicationService) {}

  @Get()
  @ApiOperation({
    summary: 'List applications awaiting review (oldest deadline first)',
    description: 'Defaults to PENDING_VERIFICATION and UNDER_REVIEW. Overdue ones are flagged, never auto-decided.',
  })
  list(
    @Query(new ZodValidationPipe(ListApplicationsQuerySchema)) query: ListApplicationsQueryDto,
  ): Promise<PaginatedResponse<AdminApplicationSummary>> {
    return this.applications.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Application details with documents metadata and audit trail' })
  get(@Param('id', ParseUUIDPipe) id: string): Promise<AdminApplicationDetail> {
    return this.applications.getForReview(id);
  }

  @Get(':id/documents/:documentId')
  @ApiOperation({ summary: 'Download a submitted document (recorded in the audit trail)' })
  async document(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Res() res: Response,
  ): Promise<void> {
    sendDocument(res, await this.applications.readDocumentForReview({ id: user.sub, role: user.role }, id, documentId));
  }

  @Post(':id/start-review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Claim the application: PENDING_VERIFICATION -> UNDER_REVIEW' })
  start(@CurrentUser() user: JwtPayload, @Param('id', ParseUUIDPipe) id: string): Promise<AdminApplicationDetail> {
    return this.applications.startReview({ id: user.sub, role: user.role }, id);
  }

  @Post(':id/request-info')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ask the applicant for more information or documents' })
  requestInfo(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RequestInfoSchema)) dto: RequestInfoDto,
  ): Promise<AdminApplicationDetail> {
    return this.applications.requestInfo({ id: user.sub, role: user.role }, id, dto);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reject with a reason shown to the applicant' })
  reject(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(RejectApplicationSchema)) dto: RejectApplicationDto,
  ): Promise<AdminApplicationDetail> {
    return this.applications.reject({ id: user.sub, role: user.role }, id, dto);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Approve after human verification',
    description:
      'Requires the reviewer to record the registry check (official register consulted, or why none was available) ' +
      'and notes. Creates the verified doctor profile and promotes the account in one transaction.',
  })
  approve(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(ApproveApplicationSchema)) dto: ApproveApplicationDto,
  ): Promise<AdminApplicationDetail> {
    return this.applications.approve({ id: user.sub, role: user.role }, id, dto);
  }
}
