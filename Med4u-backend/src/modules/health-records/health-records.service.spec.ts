import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Doctor } from '../../database/entities/doctor.entity';
import { MedicalReport } from '../../database/entities/medical-report.entity';
import { Prescription } from '../../database/entities/prescription.entity';
import { PrescriptionUpload } from '../../database/entities/prescription-upload.entity';
import { HealthRecordsService } from './health-records.service';

describe('HealthRecordsService', () => {
  const setup = () => {
    const reports = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      save: jest.fn(),
    };
    const prescriptions = { find: jest.fn().mockResolvedValue([]) };
    const uploads = { find: jest.fn().mockResolvedValue([]) };
    const doctors = { find: jest.fn().mockResolvedValue([]) };
    const service = new HealthRecordsService(
      reports as unknown as Repository<MedicalReport>,
      prescriptions as unknown as Repository<Prescription>,
      uploads as unknown as Repository<PrescriptionUpload>,
      doctors as unknown as Repository<Doctor>,
    );
    return { service, reports, prescriptions, uploads };
  };

  it('scopes report lists and prescription lists to the authenticated patient id', async () => {
    const { service, reports, prescriptions, uploads } = setup();
    await service.listReports('patient-a');
    await service.listPrescriptions('patient-a');
    expect(reports.find).toHaveBeenCalledWith(expect.objectContaining({ where: { patientId: 'patient-a' } }));
    expect(prescriptions.find).toHaveBeenCalledWith(expect.objectContaining({ where: { patientId: 'patient-a' } }));
    expect(uploads.find).toHaveBeenCalledWith(expect.objectContaining({ where: { patientId: 'patient-a' } }));
  });

  it('returns not found for a report outside the patient scope', async () => {
    const { service, reports } = setup();
    await expect(service.reportFile('patient-b', 'report-a')).rejects.toBeInstanceOf(NotFoundException);
    expect(reports.findOne).toHaveBeenCalledWith({ where: { id: 'report-a', patientId: 'patient-b' } });
  });

  it('rejects unsupported upload content before touching private storage', async () => {
    const { service, reports } = setup();
    await expect(service.uploadReport('patient-a', {
      buffer: Buffer.from('<html>not a report file</html>'), mimetype: 'text/html', size: 28,
    }, 'Report', 'Lab')).rejects.toThrow('File content does not match');
    expect(reports.create).not.toHaveBeenCalled();
    expect(reports.save).not.toHaveBeenCalled();
  });
});
