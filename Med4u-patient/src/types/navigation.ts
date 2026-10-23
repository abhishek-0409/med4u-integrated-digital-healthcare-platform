import { LabBooking, LabTest } from "./lab";
import { NavigatorScreenParams } from "@react-navigation/native";

export type AuthStackParamList = {
  Login: undefined;
  OTP: { phone: string };
};

export type OnboardingStackParamList = {
  BasicDetails: undefined;
  HealthInfo: undefined;
  AdditionalInfo: undefined;
  AccountReady: undefined;
};

export type MainStackParamList = {
  Home: undefined;
  DoctorList: { specialization?: string; search?: string } | undefined;
  DoctorDetail: { doctorId: string };
  BookDoctor: { doctorId: string };
  AppointmentReview: {
    doctorId: string;
    slotId: string;
    date: string;
    type: "video" | "in_person";
  };
  AppointmentConfirmation: { appointmentId: string };
  Appointments: { bookedId?: string } | undefined;
  EditProfile: undefined;
  Settings: undefined;
  VideoConsult: { appointmentId: string };
  OrderMedicine: { category?: string; search?: string } | undefined;
  MedicineDetail: { medicineId: string };
  Cart: undefined;
  Checkout: { clinicalPrescriptionId?: string; prescriptionItems?: Array<{ variantId: string; quantity: number }> } | undefined;
  OrderFromPrescription: { prescriptionId: string };
  Orders: undefined;
  OrderDetail: { orderId: string };
  OrderConfirmation: { orderId: string };
  BookTest: { recommendedTestIds?: string[] } | undefined;
  LabTestDetail: { test: LabTest };
  LabBookingConfirmation: { booking: LabBooking };
  Reports: undefined;
  Prescription: undefined;
  PrescriptionDetail: { prescriptionId: string };
  Notifications: undefined;
  PharmacyConsole: undefined;
  PharmacyPrescription: { prescriptionId: string };
  PharmacyOrder: { orderId: string };
  Profile: undefined;
};

export type RootStackParamList = {
  AuthFlow: undefined;
  OnboardingFlow: undefined;
  MainFlow: NavigatorScreenParams<MainStackParamList> | undefined;
};
