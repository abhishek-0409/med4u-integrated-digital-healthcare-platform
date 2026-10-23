import { RootStackParamList } from "../types/navigation";

type RootNavigation = {
  isReady: () => boolean;
  navigate: (route: "MainFlow", params: NonNullable<RootStackParamList["MainFlow"]>) => void;
};

/** Deep-links only an authenticated app to its own API-authorized prescription detail route. */
export function openPrescriptionNotification(navigation: RootNavigation, authenticated: boolean, data: unknown): boolean {
  if (!navigation.isReady() || !authenticated || !data || typeof data !== "object") return false;
  const payload = data as { type?: unknown; prescriptionId?: unknown };
  if ((payload.type !== "prescription_ready" && payload.type !== "prescription_issued") || typeof payload.prescriptionId !== "string") return false;
  navigation.navigate("MainFlow", { screen: "PrescriptionDetail", params: { prescriptionId: payload.prescriptionId } });
  return true;
}
