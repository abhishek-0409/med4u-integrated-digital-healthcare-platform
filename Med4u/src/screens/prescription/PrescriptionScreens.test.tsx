import React from "react";
import { Share } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { makeClinicalPrescription } from "../../test/clinicalPrescriptionFixtures";

let mockFocusRefetch: (() => void) | null = null;
jest.mock("../../hooks/useRefreshOnFocus", () => ({
  // Captures the screen's focus callback so a test can simulate the patient returning to the screen.
  useRefreshOnFocus: (refetch: () => void) => { mockFocusRefetch = refetch; },
}));
jest.mock("../../services/clinical-prescription.service", () => ({
  clinicalPrescriptionService: { list: jest.fn(), get: jest.fn() },
}));
jest.mock("expo-print", () => ({ printToFileAsync: jest.fn().mockResolvedValue({ uri: "file:///cache/rx.pdf" }), printAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn().mockResolvedValue(true), shareAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock("expo-file-system", () => ({ deleteAsync: jest.fn().mockResolvedValue(undefined) }));
jest.mock("../../services/health-records.service", () => ({ healthRecordsService: { prescriptions: jest.fn() } }));
jest.mock("../../components/prescription/PrescriptionUploader", () => ({ PrescriptionUploader: () => null }));
jest.mock("../../components/pharmacy/PrescriptionViewer", () => ({ PrescriptionViewer: () => null }));

import { clinicalPrescriptionService } from "../../services/clinical-prescription.service";
import { healthRecordsService } from "../../services/health-records.service";
import { ApiError } from "../../services/api/errors";
import { PrescriptionDetailScreen } from "./PrescriptionDetailScreen";
import { PrescriptionScreen } from "./PrescriptionScreen";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";

const list = clinicalPrescriptionService.list as jest.Mock;
const get = clinicalPrescriptionService.get as jest.Mock;
const records = healthRecordsService.prescriptions as jest.Mock;
const page = (items: unknown[]) => ({ items, meta: { page: 1, limit: 50, total: items.length, totalPages: 1 } });
const wrap = (node: React.ReactElement) =>
  render(<SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, right: 0, bottom: 0, left: 0 } }}>{node}</SafeAreaProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  mockFocusRefetch = null;
  records.mockResolvedValue([]);
});

describe("PrescriptionScreen (doctor-issued list)", () => {
  const navigation = { navigate: jest.fn() };
  const renderList = () => wrap(<PrescriptionScreen navigation={navigation as never} route={{ key: "k", name: "Prescription" } as never} />);

  it("shows an empty state, then the prescription once the doctor issues it (sync on focus)", async () => {
    list.mockResolvedValueOnce(page([]));
    renderList();
    expect(await screen.findByText("No prescriptions from your doctors yet")).toBeTruthy();

    list.mockResolvedValueOnce(page([makeClinicalPrescription()]));
    await act(async () => { mockFocusRefetch?.(); });
    expect(await screen.findByText("Dr. Asha Rao")).toBeTruthy();
    expect(screen.getByText("Viral fever")).toBeTruthy();
    expect(screen.queryByText("No prescriptions from your doctors yet")).toBeNull();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it("opens the detail screen for the tapped prescription", async () => {
    list.mockResolvedValue(page([makeClinicalPrescription()]));
    renderList();
    fireEvent.press(await screen.findByLabelText("Open prescription RX-1A2B3C4D-V1 from Dr. Asha Rao"));
    expect(navigation.navigate).toHaveBeenCalledWith("PrescriptionDetail", { prescriptionId: "rx-1" });
  });

  it("labels cancelled and replaced prescriptions so they are not mistaken for current ones", async () => {
    list.mockResolvedValue(page([
      makeClinicalPrescription({ id: "a", status: "cancelled" }),
      makeClinicalPrescription({ id: "b", reference: "RX-B-V1", status: "superseded" }),
    ]));
    renderList();
    expect(await screen.findByText("Cancelled")).toBeTruthy();
    expect(screen.getByText("Replaced")).toBeTruthy();
  });

  it("shows an error with retry for the doctor list without hiding the rest of the screen", async () => {
    list.mockRejectedValueOnce(new ApiError("Could not connect.", "network")).mockResolvedValueOnce(page([makeClinicalPrescription()]));
    renderList();
    expect(await screen.findByText("Couldn't load doctor prescriptions")).toBeTruthy();
    expect(screen.getByText("Prescription history")).toBeTruthy();
    fireEvent.press(screen.getByText("Try again"));
    expect(await screen.findByText("Dr. Asha Rao")).toBeTruthy();
  });
});

describe("PrescriptionDetailScreen", () => {
  const navigation = { navigate: jest.fn() };
  const renderDetail = () => wrap(<PrescriptionDetailScreen navigation={navigation as never} route={{ key: "k", name: "PrescriptionDetail", params: { prescriptionId: "rx-1" } } as never} />);

  it("shows doctor, dates, diagnosis, dosage instructions, follow-up and status", async () => {
    get.mockResolvedValue(makeClinicalPrescription());
    renderDetail();
    expect(await screen.findByText("Dr. Asha Rao")).toBeTruthy();
    expect(screen.getByText(/Cardiology/)).toBeTruthy();
    // Consultation date and issue date are both shown (same day in this fixture).
    expect(screen.getAllByText("20 Oct 2026")).toHaveLength(2);
    expect(screen.getByText("Viral fever")).toBeTruthy();
    expect(screen.getByText("1. Paracetamol 500 mg (tablet)")).toBeTruthy();
    expect(screen.getByText("1 tablet, Oral route, three times daily, for 5 days, morning and night, after food")).toBeTruthy();
    expect(screen.getByText("Quantity: 15 tablets · Food: After food")).toBeTruthy();
    expect(screen.getByText("Please review with your doctor on 5 Nov 2026.")).toBeTruthy();
    expect(screen.getByText("Issued")).toBeTruthy();
    expect(screen.getByText("RX-1A2B3C4D-V1")).toBeTruthy();
    expect(get).toHaveBeenCalledWith("rx-1");
  });

  it("does not fabricate registration details or a signature", async () => {
    get.mockResolvedValue(makeClinicalPrescription());
    renderDetail();
    expect(await screen.findByText("Registration details not available")).toBeTruthy();
    expect(screen.getByText(/not digitally signed/)).toBeTruthy();
  });

  it("shows a verified registration number when one is stored", async () => {
    const rx = makeClinicalPrescription();
    get.mockResolvedValue({ ...rx, doctor: { ...rx.doctor, registrationNumber: "REG-123", registrationCouncil: "State Council", registrationVerified: true } });
    renderDetail();
    expect(await screen.findByText("Registration: REG-123 (State Council)")).toBeTruthy();
  });

  it("warns clearly when the doctor cancelled the prescription", async () => {
    get.mockResolvedValue(makeClinicalPrescription({ status: "cancelled", cancellationReason: "Written for the wrong patient" }));
    renderDetail();
    expect(await screen.findByText(/Do not take medicine from it/)).toBeTruthy();
  });

  it("shows an error with retry", async () => {
    get.mockRejectedValueOnce(new ApiError("Prescription not found.", "http", 404)).mockResolvedValueOnce(makeClinicalPrescription());
    renderDetail();
    expect(await screen.findByText("Prescription not found.")).toBeTruthy();
    fireEvent.press(screen.getByText("Try again"));
    expect(await screen.findByText("Dr. Asha Rao")).toBeTruthy();
  });

  it("re-fetches on focus so a doctor's correction appears without restarting the app", async () => {
    get.mockResolvedValueOnce(makeClinicalPrescription()).mockResolvedValueOnce(makeClinicalPrescription({ status: "superseded" }));
    renderDetail();
    await screen.findByText("Issued");
    await act(async () => { mockFocusRefetch?.(); });
    expect(await screen.findByText("Replaced by a corrected prescription")).toBeTruthy();
  });

  it("shares the document as text", async () => {
    get.mockResolvedValue(makeClinicalPrescription());
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" });
    renderDetail();
    fireEvent.press(await screen.findByText("Share prescription"));
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining("1. Paracetamol 500 mg (tablet)") })));
  });

  it("previews and shares an issued PDF, then removes the temporary file", async () => {
    get.mockResolvedValue(makeClinicalPrescription());
    renderDetail();
    fireEvent.press(await screen.findByText("Preview PDF"));
    await waitFor(() => expect(Print.printAsync).toHaveBeenCalledWith({ uri: "file:///cache/rx.pdf" }));
    fireEvent.press(screen.getByText("Share or download PDF"));
    await waitFor(() => expect(Sharing.shareAsync).toHaveBeenCalledWith("file:///cache/rx.pdf", expect.objectContaining({ mimeType: "application/pdf" })));
    expect(Print.printToFileAsync).toHaveBeenCalled();
    await waitFor(() => expect(FileSystem.deleteAsync).toHaveBeenCalledWith("file:///cache/rx.pdf", { idempotent: true }));
  });
});
