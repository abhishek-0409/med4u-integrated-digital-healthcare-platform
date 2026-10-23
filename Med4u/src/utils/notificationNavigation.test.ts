import { openPrescriptionNotification } from "./notificationNavigation";

describe("openPrescriptionNotification", () => {
  it("opens only the authenticated prescription detail route for a valid notification", () => {
    const navigation = { isReady: jest.fn(() => true), navigate: jest.fn() };
    expect(openPrescriptionNotification(navigation, true, { type: "prescription_ready", prescriptionId: "rx-owned-by-server" })).toBe(true);
    expect(navigation.navigate).toHaveBeenCalledWith("MainFlow", { screen: "PrescriptionDetail", params: { prescriptionId: "rx-owned-by-server" } });
  });

  it("also supports the in-app prescription-issued notification type", () => {
    const navigation = { isReady: jest.fn(() => true), navigate: jest.fn() };
    expect(openPrescriptionNotification(navigation, true, { type: "prescription_issued", prescriptionId: "rx-2" })).toBe(true);
    expect(navigation.navigate).toHaveBeenCalledWith("MainFlow", { screen: "PrescriptionDetail", params: { prescriptionId: "rx-2" } });
  });

  it("ignores unauthenticated, unready, and malformed notification data", () => {
    const navigation = { isReady: jest.fn(() => true), navigate: jest.fn() };
    expect(openPrescriptionNotification(navigation, false, { type: "prescription_ready", prescriptionId: "rx" })).toBe(false);
    expect(openPrescriptionNotification({ ...navigation, isReady: () => false }, true, { type: "prescription_ready", prescriptionId: "rx" })).toBe(false);
    expect(openPrescriptionNotification(navigation, true, { type: "other" })).toBe(false);
    expect(navigation.navigate).not.toHaveBeenCalled();
  });
});
