import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check } from "lucide-react-native";
import { LeafMark } from "../../components/onboarding/BrandLogo";
import { Button } from "../../components/ui/Button";
import { toApiError } from "../../services/api/errors";
import { userService } from "../../services/user.service";
import { useAuthStore } from "../../store/authStore";
import { colors } from "../../theme/colors";
import { layout, radius, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { OnboardingStackParamList } from "../../types/navigation";
import { firstIncompleteStep } from "../../utils/profileForm";

type Props = NativeStackScreenProps<OnboardingStackParamList, "AccountReady">;

export function AccountReadyScreen({ navigation }: Props) {
  const setUser = useAuthStore((state) => state.setUser);
  const completeOnboarding = useAuthStore((state) => state.completeOnboarding);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Home opens only once the backend itself reports the profile as complete.
  const onGoHome = async () => {
    if (checking) return;
    setChecking(true);
    setError(null);
    try {
      const profile = await userService.getProfile();
      setUser(profile);
      if (profile.isProfileComplete) {
        completeOnboarding();
        return;
      }
      setError("A few required details are still missing. Please complete them to continue.");
      navigation.navigate(firstIncompleteStep(profile) === "HealthInfo" ? "HealthInfo" : "BasicDetails");
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.body}>
        <View style={styles.illustration}>
          <LeafMark size={96} />
          <View style={styles.badge}>
            <Check size={26} color={colors.white} strokeWidth={3} />
          </View>
        </View>
        <Text style={styles.title} accessibilityRole="header">
          All Set!
        </Text>
        <Text style={styles.subtitle}>Your account has been created successfully.</Text>
        {error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}
      </View>
      <View style={styles.footer}>
        <Button title="Go to Home" loading={checking} onPress={() => void onGoHome()} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.warmCream },
  body: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: layout.screenPadding,
    gap: spacing.sm,
  },
  illustration: {
    width: 168,
    height: 168,
    borderRadius: radius.xl,
    backgroundColor: colors.lightSage,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  badge: {
    position: "absolute",
    right: 18,
    bottom: 18,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.forestGreen,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: colors.warmCream,
  },
  title: { fontSize: 32, lineHeight: 38, fontWeight: "700", color: colors.forestGreen },
  subtitle: { ...typography.body, fontSize: 16, lineHeight: 24, color: colors.secondaryText, textAlign: "center" },
  error: { ...typography.caption, color: colors.danger, textAlign: "center", marginTop: spacing.xs },
  footer: { paddingHorizontal: layout.screenPadding, paddingBottom: spacing.sm, width: "100%", maxWidth: 480, alignSelf: "center" },
});
