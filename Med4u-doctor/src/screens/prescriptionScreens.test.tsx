import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { ConsultationSummaryScreen } from "./ConsultationSummaryScreen";
import { PrescriptionEditorScreen } from "./PrescriptionEditorScreen";
import { PrescriptionReviewScreen } from "./PrescriptionReviewScreen";
import { appointmentApi } from "../services/appointmentApi";
import { prescriptionApi } from "../services/prescriptionApi";
import { draftCache } from "../prescription/draftCache";
import { DoctorPrescription } from "../types/prescription";

const mockReact = require("react");
const mockRN = require("react-native");

jest.mock("../components/ui", () => ({
  Page: ({ children }: { children: unknown }) => mockReact.createElement(mockRN.View, null, children),
  TopBar: () => null,
  Card: ({ children }: { children: unknown }) => mockReact.createElement(mockRN.View, null, children),
  ActionButton: ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) =>
    mockReact.createElement(mockRN.Pressable, { accessibilityRole: "button", accessibilityState: { disabled: Boolean(disabled) }, onPress: disabled ? undefined : onPress }, mockReact.createElement(mockRN.Text, null, label)),
}));
jest.mock("../dashboard/DashboardView", () => ({
  ErrorCard: ({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) =>
    mockReact.createElement(mockRN.View, null, mockReact.createElement(mockRN.Text, null, title), mockReact.createElement(mockRN.Text, null, message), mockReact.createElement(mockRN.Pressable, { onPress: onRetry }, mockReact.createElement(mockRN.Text, null, "Try again"))),
}));
jest.mock("@react-navigation/native", () => ({ useFocusEffect: (cb: () => void) => require("react").useEffect(cb, [cb]), useNavigation: () => ({}) }));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaView: ({ children }: { children: unknown }) => require("react").createElement(require("react-native").View, null, children) }));
jest.mock("../services/appointmentApi", () => ({ appointmentApi: { get: jest.fn() } }));
jest.mock("../services/prescriptionApi", () => ({
  prescriptionApi: { state: jest.fn(), saveDraft: jest.fn(), issue: jest.fn(), get: jest.fn(), searchCatalog: jest.fn().mockResolvedValue([]) },
  // Retry timing is covered in prescriptionApi.test.ts; here a single attempt keeps the UI tests fast.
  retryIdempotent: (send: () => Promise<unknown>) => send(),
}));

const APPT = "11111111-1111-4111-8111-111111111111";
const rx = (over: Partial<DoctorPrescription> = {}): DoctorPrescription => ({
  id: "rx-1",
  reference: "RX-AAAA1111-V1",
  status: "draft",
  version: 1,
  revision: 4,
  diagnosis: "Viral fever",
  medicines: [{ catalogMedicineId: null, source: "manual", name: "Paracetamol", genericName: null, strength: "500 mg", dosageForm: "tablet", dose: "1 tablet", route: "oral", frequency: "Three times daily", durationValue: 5, durationUnit: "days", quantity: 15, quantityUnit: "tablets", timing: ["morning"], foodRelation: "after_food", instructions: null }],
  recommendedTests: [],
  additionalInstructions: null,
  warnings: null,
  followUpDate: null,
  consultation: { appointmentId: APPT, date: "2026-10-20", startTime: "10:00:00", endTime: "10:30:00" },
  patient: { id: "p1", name: "Pia Patient" },
  issuedAt: null,
  doctor: { name: "Dr. Asha Rao", specialization: "Cardiology", clinicName: null, registrationNumber: null, registrationCouncil: null, registrationVerified: false, isDemo: false },
  supersedesId: null,
  supersededById: null,
  amendmentReason: null,
  cancelledAt: null,
  cancellationReason: null,
  digitallySigned: false,
  ...over,
});
const eligible = { canPrescribe: true, code: null, message: null };
const appointment = (status: string) => ({ id: APPT, status, type: "video", date: "2026-10-20", startTime: "10:00:00", endTime: "10:30:00", timeZone: "Asia/Kolkata", notes: null, patient: { id: "p1", name: "Pia Patient" }, canJoin: false, canCancel: false });
const nav = () => ({ navigate: jest.fn(), replace: jest.fn(), goBack: jest.fn(), reset: jest.fn(), addListener: jest.fn(() => () => undefined), dispatch: jest.fn() });

beforeEach(() => {
  jest.clearAllMocks();
  draftCache.clearAll();
});

describe("ConsultationSummaryScreen", () => {
  const renderSummary = (n = nav()) => {
    render(<ConsultationSummaryScreen navigation={n as never} route={{ params: { appointmentId: APPT } } as never} />);
    return n;
  };

  it("offers Add Prescription once the consultation is completed", async () => {
    jest.mocked(appointmentApi.get).mockResolvedValue(appointment("completed") as never);
    jest.mocked(prescriptionApi.state).mockResolvedValue({ eligibility: eligible, draft: null, issued: null });
    const n = renderSummary();
    expect(await screen.findByText("Pia Patient")).toBeTruthy();
    expect(screen.getByText("Consultation completed")).toBeTruthy();
    fireEvent.press(screen.getByText("Add Prescription"));
    expect(n.navigate).toHaveBeenCalledWith("PrescriptionEditor", { appointmentId: APPT });
    expect(screen.queryByText("View Prescription")).toBeNull();
  });

  it("offers View Prescription (and not Add) when one is already issued", async () => {
    jest.mocked(appointmentApi.get).mockResolvedValue(appointment("completed") as never);
    jest.mocked(prescriptionApi.state).mockResolvedValue({ eligibility: eligible, draft: null, issued: rx({ status: "issued" }) });
    const n = renderSummary();
    fireEvent.press(await screen.findByText("View Prescription"));
    expect(n.navigate).toHaveBeenCalledWith("PrescriptionDetail", { prescriptionId: "rx-1", appointmentId: APPT });
    expect(screen.queryByText("Add Prescription")).toBeNull();
  });

  it("does not offer prescribing while the consultation is not completed", async () => {
    jest.mocked(appointmentApi.get).mockResolvedValue(appointment("confirmed") as never);
    jest.mocked(prescriptionApi.state).mockResolvedValue({ eligibility: { canPrescribe: false, code: "CONSULTATION_NOT_COMPLETED", message: "A prescription can be written only after the consultation has ended." }, draft: null, issued: null });
    renderSummary();
    expect(await screen.findByText("Not completed yet")).toBeTruthy();
    expect(screen.queryByText("Add Prescription")).toBeNull();
    expect(screen.getByText("Refresh status")).toBeTruthy();
  });

  it("shows an error with retry when the server cannot be reached", async () => {
    jest.mocked(appointmentApi.get).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(appointment("completed") as never);
    jest.mocked(prescriptionApi.state).mockResolvedValue({ eligibility: eligible, draft: null, issued: null });
    renderSummary();
    fireEvent.press(await screen.findByText("Try again"));
    expect(await screen.findByText("Add Prescription")).toBeTruthy();
  });
});

describe("PrescriptionReviewScreen", () => {
  const renderReview = (n = nav()) => {
    jest.mocked(prescriptionApi.state).mockResolvedValue({ eligibility: eligible, draft: rx(), issued: null });
    render(<PrescriptionReviewScreen navigation={n as never} route={{ params: { appointmentId: APPT } } as never} />);
    return n;
  };
  const confirmIssue = async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
    fireEvent.press(await screen.findByText(/^(Issue prescription|Try issuing again)$/));
    const buttons = alert.mock.calls[alert.mock.calls.length - 1][2]!;
    return buttons.find((b) => b.text === "Issue prescription")!.onPress!;
  };

  it("shows dosage instructions clearly before issuing", async () => {
    renderReview();
    expect(await screen.findByText("1. Paracetamol 500 mg (tablet)")).toBeTruthy();
    expect(screen.getByText("1 tablet, Oral route, three times daily, for 5 days, morning, after food")).toBeTruthy();
    expect(screen.getByText(/not digitally signed/i)).toBeTruthy();
    expect(screen.getByText("Not yet issued")).toBeTruthy();
  });

  it("asks for confirmation and issues only once even if confirmed twice (double tap)", async () => {
    const n = renderReview();
    let resolve!: (v: unknown) => void;
    jest.mocked(prescriptionApi.issue).mockReturnValue(new Promise((r) => { resolve = r; }) as never);
    const confirm = await confirmIssue();
    expect(prescriptionApi.issue).not.toHaveBeenCalled(); // nothing is issued before confirming
    act(() => { confirm(); confirm(); });
    expect(prescriptionApi.issue).toHaveBeenCalledTimes(1);
    expect(prescriptionApi.issue).toHaveBeenCalledWith("rx-1", 4);
    await act(async () => { resolve({ prescription: rx({ status: "issued" }), alreadyIssued: false }); });
    await waitFor(() => expect(n.replace).toHaveBeenCalledWith("PrescriptionDetail", { prescriptionId: "rx-1", appointmentId: APPT, justIssued: true }));
  });

  it("keeps the draft and allows a safe retry after a network error", async () => {
    const n = renderReview();
    jest.mocked(prescriptionApi.issue).mockRejectedValueOnce(new Error("Could not connect. Check your internet connection and try again."));
    const first = await confirmIssue();
    await act(async () => { first(); });
    expect(await screen.findByText(/Could not connect/)).toBeTruthy();
    expect(screen.getByText(/Nothing was lost/)).toBeTruthy();
    expect(n.replace).not.toHaveBeenCalled();

    jest.mocked(prescriptionApi.issue).mockResolvedValueOnce({ prescription: rx({ status: "issued" }), alreadyIssued: true });
    const second = await confirmIssue();
    await act(async () => { second(); });
    expect(prescriptionApi.issue).toHaveBeenNthCalledWith(2, "rx-1", 4); // same prescription, same reviewed revision
    await waitFor(() => expect(n.replace).toHaveBeenCalledWith("PrescriptionDetail", expect.objectContaining({ justIssued: true })));
  });
});

describe("PrescriptionEditorScreen", () => {
  const renderEditor = (n = nav()) => {
    jest.mocked(prescriptionApi.state).mockResolvedValue({ eligibility: eligible, draft: null, issued: null });
    render(<PrescriptionEditorScreen navigation={n as never} route={{ params: { appointmentId: APPT } } as never} />);
    return n;
  };

  it("allows a diagnosis-only prescription when the doctor has no medicines or tests to recommend", async () => {
    const n = renderEditor();
    jest.mocked(prescriptionApi.saveDraft).mockResolvedValueOnce(rx({ id: "rx-1", revision: 1 }) as never);
    expect(await screen.findByText(/No medicines added yet/)).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText("Diagnosis"), "Viral fever");
    fireEvent.press(screen.getByText("Review prescription"));
    await waitFor(() => expect(prescriptionApi.saveDraft).toHaveBeenCalledWith(APPT, expect.objectContaining({ medicines: [], recommendedTests: [] })));
    expect(n.navigate).toHaveBeenCalledWith("PrescriptionReview", { appointmentId: APPT });
  });

  it("keeps what the doctor typed when saving fails, then saves on retry", async () => {
    renderEditor();
    await screen.findByText(/No medicines added yet/);
    fireEvent.changeText(screen.getByLabelText("Diagnosis"), "Viral fever");
    jest.mocked(prescriptionApi.saveDraft).mockRejectedValueOnce(new Error("Could not connect."));
    fireEvent.press(screen.getByText("Save draft"));
    expect(await screen.findByText(/Your entries are kept on this screen/)).toBeTruthy();
    expect(screen.getByLabelText("Diagnosis").props.value).toBe("Viral fever");
    expect(draftCache.get(APPT)?.form.diagnosis).toBe("Viral fever");

    jest.mocked(prescriptionApi.saveDraft).mockResolvedValueOnce(rx());
    fireEvent.press(screen.getByText("Retry saving draft"));
    expect(await screen.findByText(/Draft saved/)).toBeTruthy();
    expect(screen.getByText(/not visible to the patient until you issue it/)).toBeTruthy();
    expect(prescriptionApi.saveDraft).toHaveBeenLastCalledWith(APPT, expect.objectContaining({ diagnosis: "Viral fever" }));
  });

  it("debounces edits and sends the server revision with the autosave", async () => {
    const serverDraft = rx({ revision: 7 });
    jest.mocked(prescriptionApi.state).mockResolvedValue({ eligibility: eligible, draft: serverDraft, issued: null });
    jest.mocked(prescriptionApi.saveDraft).mockResolvedValue(rx({ revision: 8 }));
    render(<PrescriptionEditorScreen navigation={nav() as never} route={{ params: { appointmentId: APPT } } as never} />);
    expect(await screen.findByDisplayValue("Viral fever")).toBeTruthy();
    jest.useFakeTimers();
    try {
      fireEvent.changeText(screen.getByLabelText("Diagnosis"), "Adjusted assessment");
      await act(async () => { jest.advanceTimersByTime(799); });
      expect(prescriptionApi.saveDraft).not.toHaveBeenCalled();
      await act(async () => { jest.advanceTimersByTime(1); await Promise.resolve(); await Promise.resolve(); });
      expect(prescriptionApi.saveDraft).toHaveBeenCalledWith(APPT, expect.objectContaining({ diagnosis: "Adjusted assessment", baseRevision: 7 }));
    } finally { jest.useRealTimers(); }
  });

  it("restores an existing server draft and edits it in place", async () => {
    jest.mocked(prescriptionApi.state).mockResolvedValue({ eligibility: eligible, draft: rx(), issued: null });
    render(<PrescriptionEditorScreen navigation={nav() as never} route={{ params: { appointmentId: APPT } } as never} />);
    expect(await screen.findByDisplayValue("Viral fever")).toBeTruthy();
    expect(screen.getByText("Paracetamol 500 mg (tablet)")).toBeTruthy();
    expect(screen.getByText("1 tablet, Oral route, three times daily, for 5 days, morning, after food")).toBeTruthy();
  });
});
