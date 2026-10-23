import { AvailabilitySchedule, ConsultationMode, DaySchedule } from '../../entities/doctor.entity';
import { Gender } from '../../entities/user.entity';

/**
 * DEMO doctors. Every person here is fictional and every profile is stored with is_demo = true
 * and is_verified = false. There are no medical registration numbers (the unique licence column
 * holds the demo key, e.g. "DEMO-DOC-001"), no reviews or ratings, and no login credentials:
 * the linked user has a non-phone placeholder identity so nobody can sign in as these doctors.
 * Consultation fees are illustrative INR amounts, not market quotes.
 */

export interface DemoDoctor {
  /** Stable key; also the unique licence_number column of the demo profile. */
  key: string;
  name: string;
  gender: Gender;
  specialization: string;
  experienceYears: number;
  /** INR, whole rupees. */
  fee: number;
  city: string;
  mode: ConsultationMode;
  languages: string[];
  degrees: string[];
  clinicName: string;
  bio: string;
  schedule: AvailabilitySchedule;
}

/** Fee band per specialty (INR), used by the seed validation test. */
export const FEE_RANGES: Record<string, [number, number]> = {
  'General Medicine': [300, 600],
  Cardiology: [600, 1200],
  Dermatology: [400, 800],
  Orthopedics: [400, 900],
  Pediatrics: [300, 700],
  Gynecology: [500, 900],
  Neurology: [600, 1200],
  Ophthalmology: [400, 800],
  ENT: [400, 700],
  Psychiatry: [600, 1100],
  Pulmonology: [500, 900],
};

const DEGREES: Record<string, string[]> = {
  'General Medicine': ['MBBS', 'MD (General Medicine)'],
  Cardiology: ['MBBS', 'MD (Medicine)', 'DM (Cardiology)'],
  Dermatology: ['MBBS', 'MD (Dermatology, Venereology & Leprosy)'],
  Orthopedics: ['MBBS', 'MS (Orthopaedics)'],
  Pediatrics: ['MBBS', 'MD (Pediatrics)'],
  Gynecology: ['MBBS', 'MS (Obstetrics & Gynaecology)'],
  Neurology: ['MBBS', 'MD (Medicine)', 'DM (Neurology)'],
  Ophthalmology: ['MBBS', 'MS (Ophthalmology)'],
  ENT: ['MBBS', 'MS (Otorhinolaryngology)'],
  Psychiatry: ['MBBS', 'MD (Psychiatry)'],
  Pulmonology: ['MBBS', 'MD (Respiratory Medicine)'],
};

const FOCUS: Record<string, string> = {
  'General Medicine': 'common everyday health concerns and follow-up care',
  Cardiology: 'heart and blood-pressure related concerns',
  Dermatology: 'skin, hair and nail concerns',
  Orthopedics: 'bone, joint and muscle concerns',
  Pediatrics: 'the health of infants, children and adolescents',
  Gynecology: "women's health and pregnancy care",
  Neurology: 'conditions of the brain and nervous system',
  Ophthalmology: 'eye health and vision concerns',
  ENT: 'ear, nose and throat concerns',
  Psychiatry: 'mental health and emotional well-being',
  Pulmonology: 'lung and breathing concerns',
};

const slot = (
  start: string,
  end: string,
  minutes: number,
  brk?: [string, string],
): DaySchedule => ({
  start,
  end,
  slotDurationMinutes: minutes,
  ...(brk ? { breakStart: brk[0], breakEnd: brk[1] } : {}),
});

const MON_SAT_DAY: AvailabilitySchedule = Object.fromEntries(
  ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((d) => [
    d,
    slot('09:00', '17:00', 30, ['13:00', '14:00']),
  ]),
);
const MON_FRI_EVENING: AvailabilitySchedule = Object.fromEntries(
  ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map((d) => [
    d,
    slot('16:00', '20:00', 20),
  ]),
);
const TUE_SAT_MIXED: AvailabilitySchedule = Object.fromEntries(
  ['tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((d) => [
    d,
    slot('10:00', '18:00', 30, ['13:30', '14:30']),
  ]),
);
const SCHEDULES = [MON_SAT_DAY, MON_FRI_EVENING, TUE_SAT_MIXED];

// name, specialization, experience (yrs), fee (INR), city, mode, languages
type Row = [string, string, number, number, string, ConsultationMode, string[]];
const { ONLINE, OFFLINE, BOTH } = ConsultationMode;

const rows: Row[] = [
  // General Medicine (5)
  [
    'Dr. Aarav Mehta',
    'General Medicine',
    14,
    450,
    'Mumbai',
    BOTH,
    ['English', 'Hindi', 'Gujarati'],
  ],
  [
    'Dr. Sunita Rao',
    'General Medicine',
    9,
    350,
    'Bengaluru',
    ONLINE,
    ['English', 'Kannada', 'Hindi'],
  ],
  [
    'Dr. Imran Qureshi',
    'General Medicine',
    18,
    550,
    'Hyderabad',
    BOTH,
    ['English', 'Hindi', 'Urdu'],
  ],
  ['Dr. Lakshmi Narayanan', 'General Medicine', 22, 600, 'Chennai', OFFLINE, ['English', 'Tamil']],
  [
    'Dr. Rohit Deshpande',
    'General Medicine',
    6,
    300,
    'Pune',
    ONLINE,
    ['English', 'Hindi', 'Marathi'],
  ],
  // Cardiology (3)
  ['Dr. Vikram Malhotra', 'Cardiology', 21, 1100, 'Delhi', BOTH, ['English', 'Hindi', 'Punjabi']],
  ['Dr. Anjali Krishnan', 'Cardiology', 15, 900, 'Kochi', BOTH, ['English', 'Malayalam', 'Hindi']],
  [
    'Dr. Sandeep Bhattacharya',
    'Cardiology',
    12,
    750,
    'Kolkata',
    OFFLINE,
    ['English', 'Bengali', 'Hindi'],
  ],
  // Dermatology (4)
  ['Dr. Neha Kapoor', 'Dermatology', 10, 700, 'Delhi', BOTH, ['English', 'Hindi']],
  ['Dr. Farhan Sheikh', 'Dermatology', 7, 500, 'Mumbai', ONLINE, ['English', 'Hindi', 'Urdu']],
  ['Dr. Meera Iyer', 'Dermatology', 16, 800, 'Bengaluru', BOTH, ['English', 'Tamil', 'Kannada']],
  ['Dr. Pooja Agarwal', 'Dermatology', 5, 400, 'Jaipur', ONLINE, ['English', 'Hindi']],
  // Orthopedics (3)
  ['Dr. Rajesh Patil', 'Orthopedics', 19, 850, 'Pune', OFFLINE, ['English', 'Marathi', 'Hindi']],
  ['Dr. Karthik Subramanian', 'Orthopedics', 13, 650, 'Chennai', BOTH, ['English', 'Tamil']],
  [
    'Dr. Gurpreet Singh',
    'Orthopedics',
    24,
    900,
    'Chandigarh',
    BOTH,
    ['English', 'Hindi', 'Punjabi'],
  ],
  // Pediatrics (4)
  ['Dr. Ananya Joshi', 'Pediatrics', 11, 500, 'Ahmedabad', BOTH, ['English', 'Gujarati', 'Hindi']],
  ['Dr. Sameer Khan', 'Pediatrics', 8, 400, 'Lucknow', ONLINE, ['English', 'Hindi', 'Urdu']],
  [
    'Dr. Revathi Menon',
    'Pediatrics',
    17,
    700,
    'Thiruvananthapuram',
    OFFLINE,
    ['English', 'Malayalam'],
  ],
  ['Dr. Tanvi Shah', 'Pediatrics', 4, 300, 'Mumbai', ONLINE, ['English', 'Hindi', 'Gujarati']],
  // Gynecology (3)
  ['Dr. Priyanka Nair', 'Gynecology', 14, 800, 'Kochi', BOTH, ['English', 'Malayalam', 'Hindi']],
  ['Dr. Shalini Verma', 'Gynecology', 20, 900, 'Delhi', BOTH, ['English', 'Hindi']],
  ['Dr. Deepa Reddy', 'Gynecology', 9, 550, 'Hyderabad', ONLINE, ['English', 'Telugu', 'Hindi']],
  // Neurology (3)
  [
    'Dr. Arvind Chatterjee',
    'Neurology',
    23,
    1200,
    'Kolkata',
    OFFLINE,
    ['English', 'Bengali', 'Hindi'],
  ],
  [
    'Dr. Nisha Pillai',
    'Neurology',
    12,
    850,
    'Bengaluru',
    BOTH,
    ['English', 'Malayalam', 'Kannada'],
  ],
  ['Dr. Harsh Vardhan', 'Neurology', 8, 650, 'Delhi', ONLINE, ['English', 'Hindi']],
  // Ophthalmology (3)
  [
    'Dr. Kavita Banerjee',
    'Ophthalmology',
    15,
    700,
    'Kolkata',
    BOTH,
    ['English', 'Bengali', 'Hindi'],
  ],
  ['Dr. Mohan Gowda', 'Ophthalmology', 18, 750, 'Bengaluru', OFFLINE, ['English', 'Kannada']],
  [
    'Dr. Isha Trivedi',
    'Ophthalmology',
    6,
    450,
    'Ahmedabad',
    ONLINE,
    ['English', 'Gujarati', 'Hindi'],
  ],
  // ENT (3)
  ['Dr. Prakash Naidu', 'ENT', 16, 600, 'Hyderabad', BOTH, ['English', 'Telugu', 'Hindi']],
  ['Dr. Rukhsar Ali', 'ENT', 9, 450, 'Lucknow', ONLINE, ['English', 'Hindi', 'Urdu']],
  ['Dr. Vivek Kulkarni', 'ENT', 13, 550, 'Pune', OFFLINE, ['English', 'Marathi', 'Hindi']],
  // Psychiatry (3)
  ['Dr. Aditi Sen', 'Psychiatry', 11, 900, 'Mumbai', ONLINE, ['English', 'Hindi', 'Bengali']],
  ['Dr. Rahul Bhandari', 'Psychiatry', 17, 1050, 'Delhi', BOTH, ['English', 'Hindi']],
  ['Dr. Swathi Prabhu', 'Psychiatry', 7, 650, 'Bengaluru', ONLINE, ['English', 'Kannada', 'Tamil']],
  // Pulmonology (2)
  ['Dr. Manoj Tiwari', 'Pulmonology', 20, 850, 'Lucknow', BOTH, ['English', 'Hindi']],
  ['Dr. Sneha Fernandes', 'Pulmonology', 10, 600, 'Mumbai', BOTH, ['English', 'Hindi', 'Konkani']],
];

// These are explicit attributes of fictional seed profiles, never inferred at runtime from names.
const DEMO_GENDER_BY_KEY: Record<string, Gender> = {
  'DEMO-DOC-001': Gender.MALE,
  'DEMO-DOC-002': Gender.FEMALE,
  'DEMO-DOC-003': Gender.MALE,
  'DEMO-DOC-004': Gender.FEMALE,
  'DEMO-DOC-005': Gender.MALE,
  'DEMO-DOC-006': Gender.MALE,
  'DEMO-DOC-007': Gender.FEMALE,
  'DEMO-DOC-008': Gender.MALE,
  'DEMO-DOC-009': Gender.FEMALE,
  'DEMO-DOC-010': Gender.MALE,
  'DEMO-DOC-011': Gender.FEMALE,
  'DEMO-DOC-012': Gender.FEMALE,
  'DEMO-DOC-013': Gender.MALE,
  'DEMO-DOC-014': Gender.MALE,
  'DEMO-DOC-015': Gender.MALE,
  'DEMO-DOC-016': Gender.FEMALE,
  'DEMO-DOC-017': Gender.MALE,
  'DEMO-DOC-018': Gender.FEMALE,
  'DEMO-DOC-019': Gender.FEMALE,
  'DEMO-DOC-020': Gender.FEMALE,
  'DEMO-DOC-021': Gender.FEMALE,
  'DEMO-DOC-022': Gender.FEMALE,
  'DEMO-DOC-023': Gender.MALE,
  'DEMO-DOC-024': Gender.FEMALE,
  'DEMO-DOC-025': Gender.MALE,
  'DEMO-DOC-026': Gender.FEMALE,
  'DEMO-DOC-027': Gender.MALE,
  'DEMO-DOC-028': Gender.FEMALE,
  'DEMO-DOC-029': Gender.MALE,
  'DEMO-DOC-030': Gender.FEMALE,
  'DEMO-DOC-031': Gender.MALE,
  'DEMO-DOC-032': Gender.FEMALE,
  'DEMO-DOC-033': Gender.MALE,
  'DEMO-DOC-034': Gender.FEMALE,
  'DEMO-DOC-035': Gender.MALE,
  'DEMO-DOC-036': Gender.FEMALE,
};

export const DEMO_DOCTORS: DemoDoctor[] = rows.map(
  ([name, specialization, experienceYears, fee, city, mode, languages], i) => {
    const key = `DEMO-DOC-${String(i + 1).padStart(3, '0')}`;
    return {
      key,
      name,
      gender: DEMO_GENDER_BY_KEY[key],
      specialization,
      experienceYears,
      fee,
      city,
      mode,
      languages,
      degrees: DEGREES[specialization],
      clinicName: `Demo ${specialization} Clinic, ${city}`,
      bio: `Demo profile (fictional). Consults on ${FOCUS[specialization]}.`,
      schedule: SCHEDULES[i % SCHEDULES.length],
    };
  },
);
