import React, { useEffect, useState } from "react";
import { Image, Linking, Platform, StyleSheet, Text, View } from "react-native";
import { Button } from "../ui/Button";
import { Loader } from "../ui/Loader";
import { toApiError } from "../../services/api/errors";
import { reportService } from "../../services/report.service";
import { colors } from "../../theme/colors";
import { radius, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

const toBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

/** Loads a report only through the authenticated owner-scoped API; file bytes stay in memory. */
export function SecureReportViewer({ reportId }: { reportId: string }) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "image"; uri: string }
    | { kind: "pdf"; bytes: ArrayBuffer }
  >({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState({ kind: "loading" });
    reportService.file(reportId)
      .then(({ data, contentType }) => {
        if (cancelled) return;
        setState(contentType.startsWith("image/")
          ? { kind: "image", uri: `data:${contentType};base64,${toBase64(data)}` }
          : { kind: "pdf", bytes: data });
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ kind: "error", message: toApiError(error).message });
      });
    return () => { cancelled = true; };
  }, [reportId, attempt]);

  if (state.kind === "loading") return <Loader />;
  if (state.kind === "error") return (
    <View style={styles.box}>
      <Text style={styles.error} accessibilityRole="alert">Couldn&apos;t load this report: {state.message}</Text>
      <Button title="Try again" size="sm" fullWidth={false} variant="secondary" onPress={() => setAttempt((n) => n + 1)} />
    </View>
  );
  if (state.kind === "image") return (
    <Image source={{ uri: state.uri }} style={styles.image} resizeMode="contain" accessibilityLabel="Medical report" />
  );

  return (
    <View style={styles.box}>
      <Text style={styles.body}>This report is a PDF.</Text>
      {Platform.OS === "web" ? (
        <Button title="Open PDF" size="sm" fullWidth={false} onPress={() => {
          const url = URL.createObjectURL(new Blob([state.bytes], { type: "application/pdf" }));
          void Linking.openURL(url);
        }} />
      ) : (
        <Text style={styles.hint}>PDF preview is not supported on this device yet.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  image: { width: "100%", height: 420, backgroundColor: colors.skeleton, borderRadius: radius.md },
  box: { gap: spacing.xs, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.chip },
  body: { ...typography.body, color: colors.text },
  hint: { ...typography.caption, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger },
});
