import { UserRole } from '../../database/entities/user.entity';
import {
  SurgeryRecord,
  MedicationRecord,
  FamilyHistoryRecord,
} from '../../database/entities/medical-history.entity';

export interface UserProfileResponse {
  id: string;
  phone: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  dob: string | null; // ISO date string YYYY-MM-DD
  gender: string | null;
  bloodGroup: string | null;
  heightCm: number | null;
  weightKg: number | null;
  /** Computed by the backend; the client must not derive it. */
  isProfileComplete: boolean;
  role: UserRole;
  isActive: boolean;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MedicalHistoryResponse {
  id: string | null;
  userId: string;
  allergies: string[];
  chronicConditions: string[];
  pastSurgeries: SurgeryRecord[];
  currentMedications: MedicationRecord[];
  familyHistory: FamilyHistoryRecord[];
  notes: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}
