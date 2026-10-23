import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PaginatedResponse } from '../../common/utils/pagination.util';
import { JwtPayload } from '../../common/types/jwt-payload.types';
import { UserRole } from '../../database/entities/user.entity';
import {
  ListMyPrescriptionsQueryDto,
  ListMyPrescriptionsQuerySchema,
} from './dto/prescription.dto';
import { MAX_PRESCRIPTION_BYTES, PrescriptionService } from './prescription.service';
import { PrescriptionResponse } from './prescription.types';

/** A patient's own prescription uploads. Files are never reachable without an authorized call. */
@ApiTags('prescriptions')
@ApiBearerAuth('access-token')
@Roles(UserRole.PATIENT)
@Controller('v1/prescription-uploads')
export class PrescriptionController {
  constructor(private readonly prescriptions: PrescriptionService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Upload a prescription (JPEG, PNG, WebP or PDF, max 5 MB)',
    description:
      'The file type is verified from its content. The upload stays PENDING until a pharmacist reviews it ' +
      'together with an order; attach it at checkout with `prescriptionId`.',
  })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_PRESCRIPTION_BYTES, files: 1, fields: 0 },
    }),
  )
  upload(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<PrescriptionResponse> {
    return this.prescriptions.upload(user.sub, file);
  }

  @Get()
  @ApiOperation({ summary: "List the authenticated patient's prescription uploads" })
  list(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(ListMyPrescriptionsQuerySchema))
    query: ListMyPrescriptionsQueryDto,
  ): Promise<PaginatedResponse<PrescriptionResponse>> {
    return this.prescriptions.listMine(user.sub, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Review status of one of your prescriptions' })
  getOne(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PrescriptionResponse> {
    return this.prescriptions.getMine(user.sub, id);
  }

  @Get(':id/file')
  @Roles(UserRole.PATIENT, UserRole.PHARMACIST, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Download a prescription file',
    description: 'The owner or pharmacy staff only. Anyone else receives 404.',
  })
  async file(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { data, mimeType } = await this.prescriptions.getFile(
      { id: user.sub, role: user.role },
      id,
    );
    res
      .status(HttpStatus.OK)
      .set({
        'Content-Type': mimeType,
        'Content-Length': String(data.length),
        'Content-Disposition': 'inline; filename="prescription"',
        // Medical document: never cache it, never let a browser sniff or script it.
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      })
      .end(data);
  }
}
