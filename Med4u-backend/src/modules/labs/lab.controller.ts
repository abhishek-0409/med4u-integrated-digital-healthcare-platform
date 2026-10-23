import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JwtPayload } from '../../common/types/jwt-payload.types';
import { UserRole } from '../../database/entities/user.entity';
import { CreateLabBookingDto, CreateLabBookingSchema } from './lab.dto';
import { LabService } from './lab.service';

@ApiTags('lab-tests')
@ApiBearerAuth('access-token')
@Roles(UserRole.PATIENT)
@Controller('v1/lab-tests')
export class LabController {
  constructor(private readonly service: LabService) {}
  @Get() catalog() {
    return this.service.catalog();
  }
  @Get('bookings') list(@CurrentUser() user: JwtPayload) {
    return this.service.list(user.sub);
  }
  @Get('bookings/:id') get(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.get(user.sub, id);
  }
  @Post('bookings') create(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(CreateLabBookingSchema)) dto: CreateLabBookingDto,
  ) {
    return this.service.create(user.sub, dto);
  }
  @Patch('bookings/:id/cancel') cancel(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.cancel(user.sub, id);
  }
}
