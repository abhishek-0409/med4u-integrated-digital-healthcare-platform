import React, { useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Camera, FileText, Image as ImageIcon } from "lucide-react-native";
import { toApiError } from "../../services/api/errors";
import { prescriptionService } from "../../services/prescription.service";
import { colors } from "../../theme/colors";
import { iconSizes, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { PickedFile, Prescription } from "../../types/prescription";
import { filePicker, PickerError } from "../../utils/filePicker";
import { Button } from "../ui/Button";

interface PrescriptionUploaderProps {
  onUploaded: (prescription: Prescription) => void;
  disabled?: boolean;
}

/** Take a photo, choose a photo or choose a PDF, then upload it. One upload at a time. */
export function PrescriptionUploader({ onUploaded, disabled }: PrescriptionUploaderProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const run = async (pick: () => Promise<PickedFile | null>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const file = await pick();
      if (file) {
        onUploaded(await prescriptionService.upload(file));
      }
    } catch (err) {
      setError(err instanceof PickerError ? err.message : toApiError(err).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Button
          title="Take photo"
          variant="secondary"
          size="sm"
          fullWidth={false}
          leftIcon={<Camera size={iconSizes.sm} color={colors.primaryDark} />}
          disabled={disabled || busy}
          onPress={() => run(filePicker.takePhoto)}
        />
        <Button
          title="Choose photo"
          variant="secondary"
          size="sm"
          fullWidth={false}
          leftIcon={<ImageIcon size={iconSizes.sm} color={colors.primaryDark} />}
          disabled={disabled || busy}
          onPress={() => run(filePicker.choosePhoto)}
        />
        <Button
          title="Choose PDF"
          variant="secondary"
          size="sm"
          fullWidth={false}
          leftIcon={<FileText size={iconSizes.sm} color={colors.primaryDark} />}
          disabled={disabled || busy}
          onPress={() => run(filePicker.choosePdf)}
        />
      </View>
      {busy ? (
        <Text style={styles.hint} accessibilityLiveRegion="polite">
          Uploading securely…
        </Text>
      ) : (
        <Text style={styles.hint}>JPEG, PNG, WebP or PDF, up to 5 MB. Only you and Med4U pharmacists can see it.</Text>
      )}
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  hint: {
    ...typography.caption,
    color: colors.textSubtle,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
});
