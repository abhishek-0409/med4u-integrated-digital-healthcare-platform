import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID, createHash } from 'crypto';
import { mkdir, readFile, writeFile, unlink } from 'fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'path';
import { Repository } from 'typeorm';
import { Doctor } from '../../database/entities/doctor.entity';
import { MedicalReport } from '../../database/entities/medical-report.entity';
import { Prescription } from '../../database/entities/prescription.entity';
import { PrescriptionUpload } from '../../database/entities/prescription-upload.entity';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
type ValidFile = { buffer: Buffer; mimetype: string; size: number };

@Injectable()
export class HealthRecordsService {
  constructor(
    @InjectRepository(MedicalReport) private readonly reports: Repository<MedicalReport>,
    @InjectRepository(Prescription) private readonly prescriptions: Repository<Prescription>,
    @InjectRepository(PrescriptionUpload) private readonly uploads: Repository<PrescriptionUpload>,
    @InjectRepository(Doctor) private readonly doctors: Repository<Doctor>,
  ) {}

  async listReports(patientId: string) {
    const rows = await this.reports.find({ where: { patientId }, order: { createdAt: 'DESC' } });
    return rows.map(({ id, name, category, status, createdAt, mimeType, sizeBytes }) => ({
      id,
      name,
      category,
      status,
      date: createdAt,
      mimeType,
      sizeBytes,
    }));
  }

  async listPrescriptions(patientId: string) {
    const [issued, uploads] = await Promise.all([
      this.prescriptions.find({ where: { patientId }, order: { createdAt: 'DESC' } }),
      this.uploads.find({ where: { patientId }, order: { createdAt: 'DESC' } }),
    ]);
    const doctorIds = [...new Set(issued.map((row) => row.doctorId))];
    const doctors = doctorIds.length
      ? await this.doctors.find({
          where: doctorIds.map((id) => ({ id })),
          relations: { user: true },
        })
      : [];
    const names = new Map(doctors.map((doctor) => [doctor.id, doctor.user?.name ?? 'Clinician']));
    return [
      ...issued.map((row) => ({
        id: row.id,
        kind: 'issued',
        date: row.createdAt,
        status: 'issued',
        clinician: names.get(row.doctorId) ?? 'Clinician',
        // Legacy clinician files may contain public-storage URLs; never expose or link them here.
        fileAvailable: false,
      })),
      ...uploads.map((row) => ({
        id: row.id,
        kind: 'patient_upload',
        date: row.createdAt,
        status: row.status.toLowerCase(),
        clinician: null,
        fileAvailable: true,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }

  async uploadReport(
    patientId: string,
    file: ValidFile | undefined,
    name: string,
    category: string,
  ) {
    this.validateUpload(file);
    const safeName = this.requiredLabel(name, 120);
    const safeCategory = this.requiredLabel(category, 80);
    const storageKey = randomUUID().replace(/-/g, '');
    const row = this.reports.create({
      patientId,
      uploadedBy: patientId,
      name: safeName,
      category: safeCategory,
      storageKey,
      mimeType: file!.mimetype,
      sizeBytes: file!.size,
      sha256: createHash('sha256').update(file!.buffer).digest('hex'),
      status: 'uploaded',
    });
    const fullPath = await this.savePrivate(storageKey, file!.buffer);
    try {
      const saved = await this.reports.save(row);
      return {
        id: saved.id,
        name: saved.name,
        category: saved.category,
        status: saved.status,
        date: saved.createdAt,
        mimeType: saved.mimeType,
        sizeBytes: saved.sizeBytes,
      };
    } catch (error) {
      await unlink(fullPath).catch(() => undefined);
      throw error;
    }
  }

  async reportFile(patientId: string, id: string) {
    const row = await this.reports.findOne({ where: { id, patientId } });
    if (!row)
      throw new NotFoundException({ code: 'REPORT_NOT_FOUND', message: 'Report not found.' });
    return {
      buffer: await this.readPrivate(row.storageKey),
      mimeType: row.mimeType,
      fileName: 'medical-report',
    };
  }

  private validateUpload(file?: ValidFile): asserts file is ValidFile {
    if (!file || !Buffer.isBuffer(file.buffer) || file.size < 1 || file.size > MAX_FILE_SIZE)
      throw new BadRequestException({
        code: 'INVALID_FILE',
        message: 'Select a PDF, JPEG or PNG file up to 10 MB.',
      });
    const bytes = file.buffer;
    const validPdf =
      file.mimetype === 'application/pdf' && bytes.subarray(0, 5).toString() === '%PDF-';
    const validPng =
      file.mimetype === 'image/png' &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const validJpeg =
      file.mimetype === 'image/jpeg' && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (!validPdf && !validPng && !validJpeg)
      throw new BadRequestException({
        code: 'INVALID_FILE',
        message: 'File content does not match PDF, JPEG or PNG format.',
      });
  }

  private requiredLabel(value: string, max: number): string {
    const result = typeof value === 'string' ? value.trim() : '';
    if (!result || result.length > max)
      throw new BadRequestException({
        code: 'INVALID_METADATA',
        message: 'A valid report name and category are required.',
      });
    return result;
  }

  private storageRoot(): string {
    const configured = process.env.PRIVATE_FILES_DIR;
    if (!configured)
      throw new ServiceUnavailableException({
        code: 'PRIVATE_STORAGE_UNAVAILABLE',
        message: 'Private document storage is not configured.',
      });
    const root = resolve(configured);
    const fromProject = relative(process.cwd(), root);
    if (!isAbsolute(fromProject) && fromProject !== '..' && !fromProject.startsWith(`..${sep}`))
      throw new ServiceUnavailableException({
        code: 'PRIVATE_STORAGE_UNAVAILABLE',
        message: 'Private document storage must be configured outside the application directory.',
      });
    return root;
  }

  private async savePrivate(key: string, buffer: Buffer): Promise<string> {
    const root = this.storageRoot();
    await mkdir(root, { recursive: true, mode: 0o700 });
    const path = join(root, key);
    await writeFile(path, buffer, { flag: 'wx', mode: 0o600 });
    return path;
  }

  private async readPrivate(key: string): Promise<Buffer> {
    const path = join(this.storageRoot(), key);
    try {
      return await readFile(path);
    } catch {
      throw new NotFoundException({
        code: 'FILE_UNAVAILABLE',
        message: 'This document is unavailable.',
      });
    }
  }
}
