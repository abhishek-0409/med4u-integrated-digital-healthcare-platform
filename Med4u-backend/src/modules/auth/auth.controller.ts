import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Ip,
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SendOtpSchema, SendOtpDto } from './dto/send-otp.dto';
import { VerifyOtpSchema, VerifyOtpDto } from './dto/verify-otp.dto';
import { RefreshSchema, RefreshDto } from './dto/refresh.dto';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtPayload } from '../../common/types/jwt-payload.types';

@ApiTags('auth')
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ── POST /api/v1/auth/send-otp ────────────────────────────────────────────
  @Public()
  @Post('send-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request OTP',
    description:
      'Sends a 6-digit OTP to the given phone number via SMS. ' +
      'Rate limited to 3 requests per phone per 10 minutes with a 60-second cooldown between sends.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['phone'],
      properties: {
        phone: {
          type: 'string',
          example: '+919876543210',
          description: 'E.164 format phone number',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'OTP sent successfully' })
  @ApiResponse({ status: 400, description: 'Invalid phone format' })
  @ApiResponse({ status: 429, description: 'Rate limit / cooldown exceeded' })
  async sendOtp(
    @Body(new ZodValidationPipe(SendOtpSchema)) dto: SendOtpDto,
  ): Promise<{ message: string }> {
    return this.authService.sendOtp(dto);
  }

  // ── POST /api/v1/auth/verify-otp ──────────────────────────────────────────
  @Public()
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify OTP and login / register',
    description:
      'Verifies the OTP. On success, returns an access token (15 min), ' +
      'a refresh token (7 days), and the user profile. ' +
      'New users are automatically registered as patients.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['phone', 'otp'],
      properties: {
        phone: { type: 'string', example: '+919876543210' },
        otp: { type: 'string', example: '482931', description: '6-digit numeric OTP' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful — returns token pair and user profile',
  })
  @ApiResponse({ status: 400, description: 'Invalid OTP or OTP expired' })
  @ApiResponse({ status: 429, description: 'Max verification attempts exceeded' })
  async verifyOtp(
    @Body(new ZodValidationPipe(VerifyOtpSchema)) dto: VerifyOtpDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.authService.verifyOtp(dto, ip, userAgent);
  }

  // ── POST /api/v1/auth/refresh ─────────────────────────────────────────────
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate refresh token',
    description:
      'Issues a new access + refresh token pair. The supplied refresh token is ' +
      'immediately revoked (rotation). Reuse of an old token revokes all sessions.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['refreshToken'],
      properties: {
        refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'New token pair issued' })
  @ApiResponse({ status: 401, description: 'Invalid, expired, or reused refresh token' })
  async refresh(
    @Body(new ZodValidationPipe(RefreshSchema)) dto: RefreshDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.authService.refresh(dto.refreshToken, ip, userAgent);
  }

  // ── POST /api/v1/auth/logout ──────────────────────────────────────────────
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Logout — revoke all sessions',
    description:
      'Revokes every active refresh token session for the authenticated user ' +
      '(logs out all devices). Requires a valid Bearer access token.',
  })
  @ApiResponse({ status: 204, description: 'Logged out successfully' })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  async logout(@CurrentUser() user: JwtPayload): Promise<void> {
    await this.authService.logout(user.sub);
  }
}
