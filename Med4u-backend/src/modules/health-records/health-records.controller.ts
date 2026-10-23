import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtPayload } from '../../common/types/jwt-payload.types';
import { UserRole } from '../../database/entities/user.entity';
import { HealthRecordsService } from './health-records.service';

@ApiTags('medical-records')
@ApiBearerAuth('access-token')
@Roles(UserRole.PATIENT)
@Controller('v1')
export class HealthRecordsController {
  constructor(private readonly service: HealthRecordsService) {}

  @Get('medical-reports')
  reports(@CurrentUser() user: JwtPayload) {
    return this.service.listReports(user.sub);
  }

  @Post('medical-reports')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 2, parts: 3 },
    }),
  )
  uploadReport(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
    @Body('name') name: string,
    @Body('category') category: string,
  ) {
    return this.service.uploadReport(user.sub, file, name, category);
  }

  @Get('medical-reports/:id/file')
  async reportFile(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.service.reportFile(user.sub, id);
    res.set({
      'Content-Type': file.mimeType,
      'Content-Disposition': `attachment; filename="${file.fileName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.send(file.buffer);
  }

  @Get('prescriptions')
  prescriptions(@CurrentUser() user: JwtPayload) {
    return this.service.listPrescriptions(user.sub);
  }
}
