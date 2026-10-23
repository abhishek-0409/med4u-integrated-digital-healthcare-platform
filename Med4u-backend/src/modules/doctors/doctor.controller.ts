import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PaginatedResponse } from '../../common/utils/pagination.util';
import { JwtPayload } from '../../common/types/jwt-payload.types';
import { UserRole } from '../../database/entities/user.entity';
import { ConsultationMode } from '../../database/entities/doctor.entity';
import { DoctorService } from './doctor.service';
import {
  RegisterDoctorSchema,
  RegisterDoctorDto,
  ListDoctorsQuerySchema,
  ListDoctorsQueryDto,
  UpdateDoctorSchema,
  UpdateDoctorDto,
} from './dto';
import {
  DoctorListItem,
  DoctorDetailResponse,
  DoctorSelfProfileResponse,
  TimeSlotResponse,
} from './doctor.types';

@ApiTags('doctors')
@Controller('v1/doctors')
export class DoctorController {
  private readonly logger = new Logger(DoctorController.name);

  constructor(private readonly doctorService: DoctorService) {}

  // ── GET /api/v1/doctors ────────────────────────────────────────────────────

  @Public()
  @Get()
  @ApiOperation({
    summary: 'List doctors with filters and pagination',
    description:
      'Returns a paginated list of verified doctors. ' +
      'Filter by specialization, city, consultation mode, minimum rating, or maximum fee. ' +
      'Sort by rating (default), experience, or consultation fee.',
  })
  @ApiQuery({ name: 'specialization', required: false, example: 'Cardiology' })
  @ApiQuery({ name: 'city', required: false, example: 'Mumbai' })
  @ApiQuery({ name: 'minRating', required: false, type: Number, example: 4.0 })
  @ApiQuery({ name: 'maxFee', required: false, type: Number, example: 1500 })
  @ApiQuery({
    name: 'consultationMode',
    required: false,
    enum: ConsultationMode,
    example: ConsultationMode.ONLINE,
  })
  @ApiQuery({ name: 'sortBy', required: false, enum: ['rating', 'experience', 'fee'] })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 10 })
  @ApiResponse({ status: 200, description: 'Paginated doctor list' })
  async list(
    @Query(new ZodValidationPipe(ListDoctorsQuerySchema)) query: ListDoctorsQueryDto,
  ): Promise<PaginatedResponse<DoctorListItem>> {
    this.logger.log(`GET /v1/doctors query=${JSON.stringify(query)}`);
    const result = await this.doctorService.list(query);
   this.logger.log(`Doctors returned: ${result.meta.total} total, ${result.data.length} in page`);
    return result;
  }

  // ── POST /api/v1/doctors/register ─────────────────────────────────────────
  // Declared before /:id so NestJS does not route "register" as an :id param.

  @Roles(UserRole.DOCTOR)
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Register a doctor profile',
    description:
      'Creates the doctor profile for the authenticated user. ' +
      'Requires the JWT to carry role = doctor. ' +
      'Calling this endpoint a second time returns 409.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['specialization', 'licenseNumber'],
      properties: {
        specialization: { type: 'string', example: 'Cardiology' },
        licenseNumber: { type: 'string', example: 'MCI123456' },
        experienceYears: { type: 'integer', example: 10 },
        bio: { type: 'string', example: 'Senior cardiologist with 10 years experience.' },
        consultationFee: { type: 'number', example: 800 },
        languages: { type: 'array', items: { type: 'string' }, example: ['English', 'Hindi'] },
        education: {
          type: 'array',
          items: {
            type: 'object',
            required: ['degree', 'institution', 'year'],
            properties: {
              degree: { type: 'string', example: 'MBBS' },
              institution: { type: 'string', example: 'AIIMS New Delhi' },
              year: { type: 'integer', example: 2010 },
            },
          },
        },
        availabilitySchedule: {
          type: 'object',
          example: {
            monday: { start: '09:00', end: '17:00', slotDurationMinutes: 30 },
            wednesday: { start: '09:00', end: '17:00', slotDurationMinutes: 30 },
          },
        },
        city: { type: 'string', example: 'Mumbai' },
        consultationMode: { type: 'string', enum: Object.values(ConsultationMode) },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Doctor profile created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'Role is not doctor' })
  @ApiResponse({ status: 409, description: 'Profile already exists or license number taken' })
  register(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(RegisterDoctorSchema)) dto: RegisterDoctorDto,
  ): Promise<DoctorDetailResponse> {
    return this.doctorService.register(user.sub, dto);
  }

  // Fixed self route precedes GET :id to keep "me" from being parsed as a UUID.
  @Roles(UserRole.DOCTOR)
  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Get the authenticated doctor profile and eligibility status',
    description:
      'Resolves the doctor profile only from the authenticated user ID. ' +
      'Does not return license or registration numbers.',
  })
  @ApiResponse({ status: 200, description: 'Doctor self profile returned' })
  @ApiResponse({ status: 401, description: 'Missing, invalid, or inactive account' })
  @ApiResponse({ status: 403, description: 'Authenticated account is not a doctor' })
  @ApiResponse({ status: 404, description: 'No doctor profile is linked to this account' })
  getSelfProfile(@CurrentUser() user: JwtPayload): Promise<DoctorSelfProfileResponse> {
    return this.doctorService.getSelfProfile(user.sub);
  }

  // ── GET /api/v1/doctors/:id ────────────────────────────────────────────────

  @Public()
  @Get('specializations')
  @ApiOperation({
    summary: 'List specializations',
    description: 'Distinct specializations of publicly listed doctors, for filter chips.',
  })
  listSpecializations(): Promise<string[]> {
    return this.doctorService.listSpecializations();
  }

  @Public()
  @Get(':id')
  @ApiOperation({
    summary: 'Get a single doctor by ID',
    description: 'Returns full doctor details including education and availability schedule.',
  })
  @ApiParam({ name: 'id', description: 'Doctor UUID' })
  @ApiResponse({ status: 200, description: 'Doctor details returned' })
  @ApiResponse({ status: 404, description: 'Doctor not found' })
  getById(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<DoctorDetailResponse> {
    return this.doctorService.getById(id);
  }

  // ── GET /api/v1/doctors/:id/availability ──────────────────────────────────

  @Public()
  @Get(':id/availability')
  @ApiOperation({
    summary: 'Get available time slots for a doctor on a given date',
    description:
      'Returns all time slots (booked and available) for the doctor on the requested date. ' +
      'Slots are ordered by start time.',
  })
  @ApiParam({ name: 'id', description: 'Doctor UUID' })
  @ApiQuery({
    name: 'date',
    required: true,
    description: 'Date in YYYY-MM-DD format',
    example: '2025-06-15',
  })
  @ApiResponse({ status: 200, description: 'Time slots returned' })
  @ApiResponse({ status: 400, description: 'Invalid or missing date' })
  @ApiResponse({ status: 404, description: 'Doctor not found' })
  getAvailability(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Query('date') date: string,
  ): Promise<TimeSlotResponse[]> {
    // Validate date inline — keeps the pipe light and avoids a separate class
    const isRealDate =
      /^\d{4}-\d{2}-\d{2}$/.test(date ?? '') &&
      new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
    if (!isRealDate) {
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: 'Query param "date" must be a valid YYYY-MM-DD date.',
      });
    }
    return this.doctorService.getAvailability(id, date);
  }

  // ── PATCH /api/v1/doctors/me ──────────────────────────────────────────────

  @Roles(UserRole.DOCTOR)
  @Patch('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Update own doctor profile',
    description:
      'Partially updates the authenticated doctor\'s profile. ' +
      'Only supplied fields are changed. Send `null` for city or bio to clear them.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      minProperties: 1,
      properties: {
        specialization: { type: 'string', example: 'Interventional Cardiology' },
        bio: { type: 'string', nullable: true, example: 'Updated bio text.' },
        consultationFee: { type: 'number', example: 1000 },
        languages: { type: 'array', items: { type: 'string' }, example: ['English', 'Hindi'] },
        education: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              degree: { type: 'string' },
              institution: { type: 'string' },
              year: { type: 'integer' },
            },
          },
        },
        availabilitySchedule: { type: 'object' },
        city: { type: 'string', nullable: true, example: 'Delhi' },
        consultationMode: { type: 'string', enum: Object.values(ConsultationMode) },
        isAvailableToday: { type: 'boolean', example: true },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Profile updated and returned' })
  @ApiResponse({ status: 400, description: 'Validation error or empty body' })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  @ApiResponse({ status: 403, description: 'Role is not doctor' })
  @ApiResponse({ status: 404, description: 'Doctor profile not found' })
  updateMe(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(UpdateDoctorSchema)) dto: UpdateDoctorDto,
  ): Promise<DoctorDetailResponse> {
    return this.doctorService.updateMe(user.sub, dto);
  }
}
