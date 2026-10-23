import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Button } from "./Button";
import { colors } from "../../theme/colors";
import { radius, shadows, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

interface ConfirmationDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive. */
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = "Keep it",
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <Pressable
        style={styles.overlay}
        onPress={loading ? undefined : onCancel}
        accessibilityLabel="Dismiss dialog"
        accessibilityRole="button"
      >
        <Pressable style={styles.dialog} onPress={() => undefined} accessibilityViewIsModal>
          <Text style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Button title={cancelLabel} variant="secondary" size="sm" fullWidth={false} onPress={onCancel} disabled={loading} />
            <Button
              title={confirmLabel}
              variant={destructive ? "danger" : "primary"}
              size="sm"
              fullWidth={false}
              loading={loading}
              onPress={onConfirm}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  dialog: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadows.raised,
  },
  title: {
    ...typography.h3,
  },
  message: {
    ...typography.body,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
});
