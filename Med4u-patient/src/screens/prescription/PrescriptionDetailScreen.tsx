import React, { useCallback, useState } from "react";
import { RefreshControl, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { PrescriptionSheet } from "../../components/prescription/PrescriptionSheet";
import { Button } from "../../components/ui/Button";
import { ErrorState } from "../../components/ui/ErrorState";
import { LoadingSkeleton } from "../../components/ui/LoadingSkeleton";
import { Screen } from "../../components/ui/Screen";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useRefreshOnFocus } from "../../hooks/useRefreshOnFocus";
import { clinicalPrescriptionService } from "../../services/clinical-prescription.service";
import { orderService } from "../../services/order.service";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { MainStackParamList } from "../../types/navigation";
import { prescriptionToText } from "../../utils/prescriptionFormat";
import { prescriptionPdfHtml } from "../../utils/prescriptionPdf";

type Props = NativeStackScreenProps<MainStackParamList, "PrescriptionDetail">;

/**
 * One doctor-issued prescription. Refetches when the screen regains focus, so a correction or cancellation
 * made by the doctor shows up without reinstalling or restarting the app.
 */
export function PrescriptionDetailScreen({ navigation, route }: Props) {
  const { prescriptionId } = route.params;
  const { data, loading, error, reload } = useAsyncData(() => clinicalPrescriptionService.get(prescriptionId), [prescriptionId]);
  const [sharing, setSharing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  useRefreshOnFocus(reload);
  React.useEffect(() => {
    if (!data || data.status !== "issued") { setActiveOrderId(null); return; }
    let cancelled = false;
    orderService.list({ limit: 50 }).then((page) => {
      const active = page.items.find((order) => order.clinicalPrescriptionId === data.id && order.status !== "CANCELLED");
      if (!cancelled) setActiveOrderId(active?.id ?? null);
    }).catch(() => { if (!cancelled) setActiveOrderId(null); });
    return () => { cancelled = true; };
  }, [data?.id, data?.status]);

  const share = useCallback(async () => {
    if (!data) return;
    setSharing(true);
    setShareError(null);
    try {
      await Share.share({ title: `Prescription ${data.reference}`, message: prescriptionToText(data) });
    } catch {
      setShareError("The document could not be shared. Try again.");
    } finally {
      setSharing(false);
    }
  }, [data]);

  const exportPdf = useCallback(async (preview: boolean) => {
    if (!data) return;
    setShareError(null);
    preview ? setPreviewing(true) : setSharing(true);
    let uri: string | undefined;
    try {
      const file = await Print.printToFileAsync({ html: prescriptionPdfHtml(data), base64: false });
      uri = file.uri;
      if (preview) await Print.printAsync({ uri });
      else {
        if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is not available on this device.");
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf", dialogTitle: `Prescription ${data.reference}` });
      }
    } catch {
      setShareError("The prescription PDF could not be prepared or shared. Try again.");
    } finally {
      if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
      setPreviewing(false);
      setSharing(false);
    }
  }, [data]);

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} />}
      >
        {loading && !data ? (
          <LoadingSkeleton count={3} />
        ) : error && !data ? (
          <ErrorState title="Couldn't load this prescription" message={error} onRetry={reload} />
        ) : data ? (
          <>
            {error ? (
              <Text style={styles.error} accessibilityRole="alert">
                Couldn't refresh: {error}
              </Text>
            ) : null}
            <PrescriptionSheet rx={data} />
            {data.status === "issued" && !data.doctor.isDemo ? (
              <View style={styles.actions}>
                {data.medicines.length ? <Button title="Order Medicines" onPress={() => navigation.navigate("OrderFromPrescription", { prescriptionId: data.id })} /> : null}
                {data.recommendedTests?.length ? <Button title="Book Recommended Tests" variant="secondary" onPress={() => navigation.navigate("BookTest", { recommendedTestIds: data.recommendedTests.map((test) => test.labTestId) })} /> : null}
                {activeOrderId ? <Button title="View Order Status" variant="secondary" onPress={() => navigation.navigate("OrderDetail", { orderId: activeOrderId })} /> : null}
              </View>
            ) : null}
            <View style={styles.actions}>
              <Button
                title="Share prescription"
                variant="secondary"
                loading={sharing}
                onPress={() => void share()}
                accessibilityLabel="Share this prescription as text"
              />
              <Button title="Preview PDF" variant="secondary" loading={previewing} onPress={() => void exportPdf(true)} />
              <Button title="Share or download PDF" variant="secondary" loading={sharing} onPress={() => void exportPdf(false)} />
              {shareError ? <Text style={styles.error}>{shareError}</Text> : null}
              <Text style={styles.hint}>
                The shared copy is plain text. Always show your doctor's original prescription in the app when collecting medicine.
              </Text>
              <Button title="All prescriptions" variant="ghost" onPress={() => navigation.navigate("Prescription")} />
            </View>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  actions: { gap: spacing.sm },
  error: { ...typography.body, color: colors.danger },
  hint: { ...typography.caption, color: colors.textMuted },
});
