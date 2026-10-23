import React, { useEffect, useState } from "react";
import { Image, Linking, Platform, StyleSheet, Text, View } from "react-native";
import { Button } from "../ui/Button";
import { Loader } from "../ui/Loader";
import { toApiError } from "../../services/api/errors";
import { pharmacyService } from "../../services/pharmacy.service";
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

/**
 * Fetches a prescription through the authorized API and shows it in memory only: nothing is cached to
 * disk or given a shareable URL. Photos render inline; PDFs open in a browser tab on web and are not
 * previewable in the native app yet.
 */
export function PrescriptionViewer({ prescriptionId }: { prescriptionId: string }) {
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
    pharmacyService
      .file(prescriptionId)
      .then(({ data, contentType }) => {
        if (cancelled) return;
        setState(
          contentType.startsWith("image/")
            ? { kind: "image", uri: `data:${contentType};base64,${toBase64(data)}` }
            : { kind: "pdf", bytes: data },
        );
      })
      .catch((err) => !cancelled && setState({ kind: "error", message: toApiError(err).message }));
    return () => {
      cancelled = true;
    };
  }, [prescriptionId, attempt]);

  if (state.kind === "loading") return <Loader />;
  if (state.kind === "error") {
    return (
      <View style={styles.box}>
        <Text style={styles.error} accessibilityRole="alert">
          Couldn&apos;t load the prescription: {state.message}
        </Text>
        <Button title="Try again" size="sm" fullWidth={false} variant="secondary" onPress={() => setAttempt((n) => n + 1)} />
      </View>
    );
  }
  if (state.kind === "image") {
    return (
      <Image
        source={{ uri: state.uri }}
        style={styles.image}
        resizeMode="contain"
        accessibilityLabel="Uploaded prescription"
      />
    );
  }
  return (
    <View style={styles.box}>
      <Text style={styles.body}>This prescription is a PDF.</Text>
      {Platform.OS === "web" ? (
        <Button
          title="Open PDF in a new tab"
          size="sm"
          fullWidth={false}
          onPress={() => {
            const url = URL.createObjectURL(new Blob([state.bytes], { type: "application/pdf" }));
            void Linking.openURL(url);
          }}
        />
      ) : (
        <Text style={styles.body}>PDF preview isn&apos;t supported in the app yet. Review PDFs from the web version.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    width: "100%",
    height: 420,
    backgroundColor: colors.skeleton,
    borderRadius: radius.md,
  },
  box: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.chip,
  },
  body: {
    ...typography.body,
  },
  error: {
    ...typography.body,
    color: colors.danger,
  },
});
