import React from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { colors } from "../../theme/colors";
import { layout, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { StepIndicator } from "./StepIndicator";

interface OnboardingLayoutProps {
  step: 1 | 2 | 3;
  title: string;
  subtitle: string;
  onBack?: () => void;
  /** Pinned under the scrolling form (primary / secondary buttons). */
  footer: React.ReactNode;
  children: React.ReactNode;
}

/** Shared chrome: safe areas, keyboard avoidance, back arrow, progress and a pinned action area. */
export function OnboardingLayout({ step, title, subtitle, onBack, footer, children }: OnboardingLayoutProps) {
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            {onBack ? (
              <Pressable
                onPress={onBack}
                hitSlop={10}
                style={styles.back}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <ArrowLeft size={22} color={colors.forestGreen} />
              </Pressable>
            ) : (
              <View style={styles.back} />
            )}
            <StepIndicator current={step} />
            <View style={styles.heading}>
              <Text style={styles.title} accessibilityRole="header">
                {title}
              </Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
            <View style={styles.form}>{children}</View>
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <View style={styles.footerInner}>{footer}</View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: colors.warmCream },
  scrollContent: { flexGrow: 1, alignItems: "center", paddingHorizontal: layout.screenPadding },
  content: { width: "100%", maxWidth: 440, paddingTop: spacing.xs, paddingBottom: spacing.lg, gap: spacing.lg },
  back: { width: 40, height: 40, justifyContent: "center" },
  heading: { gap: spacing.xs, marginTop: spacing.xs },
  title: { ...typography.h1, color: colors.forestGreen },
  subtitle: { ...typography.body, color: colors.secondaryText, fontSize: 15, lineHeight: 22 },
  form: { gap: spacing.md },
  footer: {
    alignItems: "center",
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    backgroundColor: colors.warmCream,
  },
  footerInner: { width: "100%", maxWidth: 440, gap: spacing.sm },
});
