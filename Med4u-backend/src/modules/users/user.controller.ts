import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { UpdateProfileSchema, UpdateProfileDto } from './dto/update-profile.dto';
import { MedicalHistorySchema, MedicalHistoryDto } from './dto/medical-history.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../common/types/jwt-payload.types';
import { UserProfileResponse, MedicalHistoryResponse } from './user.types';

/**
 * All routes in this controller require a valid Bearer JWT (enforced by the
 * global JwtAuthGuard in CommonModule). There is intentionally no @Public()
 * decorator on any route.
 *
 * Authorization rules:
 *  - Users access only their own data via /me (extracted from the JWT).
 *  - Admin users follow the same /me routes to access their own profile.
 *    Cross-user admin access is handled in a dedicated admin module (future).
 */
@ApiTags('users')
@ApiBearerAuth('access-token')
@Controller('v1/users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // ── GET /api/v1/users/me ──────────────────────────────────────────────────
  @Get('me')
  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Returns the full profile of the authenticated user.',
  })
  @ApiResponse({ status: 200, description: 'Profile returned successfully' })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  @ApiResponse({ status: 404, description: 'User not found' })
  getProfile(@CurrentUser() user: JwtPayload): Promise<UserProfileResponse> {
    return this.userService.getProfile(user.sub);
  }

  // ── PATCH /api/v1/users/me ────────────────────────────────────────────────
  @Patch('me')
  @ApiOperation({
    summary: 'Update current user profile',
    description:
      'Partially updates the authenticated user\'s profile. ' +
      'Only supplied fields are changed. ' +
      'Send `null` for a field to clear it (e.g. `"email": null`).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 2, maxLength: 100, example: 'Arjun Sharma' },
        email: {
          type: 'string',
          format: 'email',
          nullable: true,
          example: 'arjun@example.com',
        },
        dob: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          nullable: true,
          example: '1990-05-15',
        },
        gender: {
          type: 'string',
          enum: ['male', 'female', 'other', 'prefer_not_to_say'],
          nullable: true,
        },
        bloodGroup: {
          type: 'string',
          enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown'],
          nullable: true,
        },
        heightCm: { type: 'number', minimum: 50, maximum: 250, nullable: true },
        weightKg: { type: 'number', minimum: 2, maximum: 500, nullable: true },
        avatarUrl: {
          type: 'string',
          format: 'uri',
          nullable: true,
          example: 'https://res.cloudinary.com/med4u/image/upload/v1/avatar.jpg',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Profile updated and returned' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(UpdateProfileSchema)) dto: UpdateProfileDto,
  ): Promise<UserProfileResponse> {
    return this.userService.updateProfile(user.sub, dto);
  }

  // ── GET /api/v1/users/me/medical-history ──────────────────────────────────
  @Get('me/medical-history')
  @ApiOperation({
    summary: 'Get medical history',
    description:
      'Returns the patient\'s self-reported medical history. ' +
      'Returns an empty record (with all arrays set to []) if no history has been submitted yet.',
  })
  @ApiResponse({
    status: 200,
    description: 'Medical history returned (empty object if never submitted)',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  getMedicalHistory(@CurrentUser() user: JwtPayload): Promise<MedicalHistoryResponse> {
    return this.userService.getMedicalHistory(user.sub);
  }

  // ── POST /api/v1/users/me/medical-history ─────────────────────────────────
  @Post('me/medical-history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create or update medical history',
    description:
      'Upserts the patient\'s medical history. ' +
      'On first call, creates the record. On subsequent calls, merges only the fields provided — ' +
      'omitted fields are left unchanged.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        allergies: {
          type: 'array',
          items: { type: 'string' },
          example: ['Penicillin', 'Pollen'],
        },
        chronicConditions: {
          type: 'array',
          items: { type: 'string' },
          example: ['Type 2 Diabetes', 'Hypertension'],
        },
        pastSurgeries: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'year'],
            properties: {
              name: { type: 'string', example: 'Appendectomy' },
              year: { type: 'integer', example: 2018 },
              notes: { type: 'string', example: 'No complications' },
            },
          },
        },
        currentMedications: {
          type: 'array',
          items: {
            type: 'object',
            required: ['name', 'dosage', 'frequency'],
            properties: {
              name: { type: 'string', example: 'Metformin' },
              dosage: { type: 'string', example: '500mg' },
              frequency: { type: 'string', example: 'Twice daily' },
              since: { type: 'string', example: '2022-01-15' },
            },
          },
        },
        familyHistory: {
          type: 'array',
          items: {
            type: 'object',
            required: ['condition', 'relation'],
            properties: {
              condition: { type: 'string', example: 'Coronary artery disease' },
              relation: {
                type: 'string',
                enum: ['father', 'mother', 'sibling', 'grandparent', 'other'],
              },
            },
          },
        },
        notes: {
          type: 'string',
          nullable: true,
          example: 'No known latex allergy. Always inform dentist of Penicillin allergy.',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Medical history saved and returned' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Missing or invalid JWT' })
  upsertMedicalHistory(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(MedicalHistorySchema)) dto: MedicalHistoryDto,
  ): Promise<MedicalHistoryResponse> {
    return this.userService.upsertMedicalHistory(user.sub, dto);
  }
}
