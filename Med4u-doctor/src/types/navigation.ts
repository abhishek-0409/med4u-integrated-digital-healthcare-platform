export type DoctorStackParamList = {
  Login: undefined;
  Application: undefined;
  Dashboard: undefined;
  Appointments: { filter?: "upcoming" | "pending" } | undefined;
  AppointmentDetail: { appointmentId: string };
  Availability: undefined;
  PatientDetails: { appointmentId: string };
  VideoConsult: { appointmentId: string };
  ConsultationSummary: { appointmentId: string };
  PrescriptionEditor: { appointmentId: string };
  PrescriptionReview: { appointmentId: string };
  PrescriptionDetail: { prescriptionId: string; appointmentId: string; justIssued?: boolean };
  History: undefined;
  Profile: undefined;
  Settings: undefined;
};
