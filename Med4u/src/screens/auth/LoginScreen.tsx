import React, { useCallback, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { FlaskConical, Phone, Pill, Stethoscope } from "lucide-react-native";
import { BrandLogo } from "../../components/onboarding/BrandLogo";
import { Button } from "../../components/ui/Button";
import { useAuth } from "../../hooks/useAuth";
import { colors } from "../../theme/colors";
import { layout, radius, sizes, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { AuthStackParamList } from "../../types/navigation";
import { toIndianE164 } from "../../utils/helpers";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

// Google and Apple sign-in are intentionally absent: the backend only supports OTP login.
export function LoginScreen({ navigation }: Props) {
  const [phone, setPhone] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const { requestOtp, clearError, isLoading, error } = useAuth();
  const displayedError = localError ?? error;

  useFocusEffect(
    useCallback(() => {
      clearError();
      setLocalError(null);
    }, [clearError]),
  );

  const sanitizedPhone = useMemo(() => phone.replace(/\D/g, "").slice(0, 10), [phone]);

  const onContinue = async () => {
    const e164 = toIndianE164(sanitizedPhone);
    if (!e164) {
      setLocalError("Enter a valid 10-digit Indian mobile number.");
      return;
    }
    setLocalError(null);
    clearError();
    try {
      await requestOtp(e164);
      navigation.navigate("OTP", { phone: e164 });
    } catch {
      // The auth store provides the server/network error shown below the field.
    }
  };

  const showLegalNotice = (document: string) => {
    Alert.alert(document, "Legal document links are not configured in this build.");
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View pointerEvents="none" style={styles.loginDecor}>
        <View style={styles.decorOrbTop} />
        <View style={styles.decorOrbBottom} />
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardAvoiding}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.brand}>
              <BrandLogo size={64} />
            </View>

            <View style={styles.form}>
              <View style={styles.headingGroup}>
                <Text style={styles.eyebrow}>YOUR HEALTH, IN ONE PLACE</Text>
                <Text style={styles.title} accessibilityRole="header">Healthcare, made simpler.</Text>
                <View style={styles.serviceRow} accessibilityLabel="Doctors, medicines, and lab tests">
                  <View style={styles.serviceChip}>
                    <Stethoscope size={15} color={colors.forestGreen} />
                    <Text style={styles.serviceText}>Doctors</Text>
                  </View>
                  <View style={styles.serviceChip}>
                    <Pill size={15} color={colors.forestGreen} />
                    <Text style={styles.serviceText}>Medicines</Text>
                  </View>
                  <View style={styles.serviceChip}>
                    <FlaskConical size={15} color={colors.forestGreen} />
                    <Text style={styles.serviceText}>Lab tests</Text>
                  </View>
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Mobile number</Text>
                <View style={[
                  styles.phoneRow,
                  phoneFocused && styles.phoneRowFocused,
                  displayedError && styles.phoneRowError,
                ]}>
                  <View style={styles.countryCode} accessibilityLabel="India country code, plus 91">
                    <Text style={styles.flag}>🇮🇳</Text>
                    <Text style={styles.countryText}>+91</Text>
                  </View>
                  <View style={styles.fieldDivider} />
                  <Phone size={18} color={colors.secondaryText} />
                  <TextInput
                    style={styles.phoneInput}
                    value={sanitizedPhone}
                    onChangeText={(value) => {
                      setPhone(value);
                      setLocalError(null);
                      clearError();
                    }}
                    onFocus={() => setPhoneFocused(true)}
                    onBlur={() => setPhoneFocused(false)}
                    placeholder="Enter mobile number"
                    placeholderTextColor={colors.textSubtle}
                    keyboardType="phone-pad"
                    maxLength={10}
                    returnKeyType="done"
                    onSubmitEditing={() => void onContinue()}
                    accessibilityLabel="10-digit Indian mobile number"
                    accessibilityHint="Enter your mobile number to receive a one-time password"
                  />
                </View>
                {displayedError ? (
                  <Text style={styles.errorText} accessibilityLiveRegion="polite">
                    {displayedError}
                  </Text>
                ) : null}
              </View>

              <Button
                title="Continue with phone"
                loading={isLoading}
                disabled={isLoading}
                onPress={() => void onContinue()}
                style={styles.cta}
              />
            </View>

            <View style={styles.legal}>
              <Text style={styles.legalIntro}>By continuing, you agree to our</Text>
              <View style={styles.legalLinks}>
                <Pressable onPress={() => showLegalNotice("Terms of Service")} hitSlop={6} accessibilityRole="link">
                  <Text style={styles.legalLink}>Terms of Service</Text>
                </Pressable>
                <Text style={styles.legalIntro}>&</Text>
                <Pressable onPress={() => showLegalNotice("Privacy Policy")} hitSlop={6} accessibilityRole="link">
                  <Text style={styles.legalLink}>Privacy Policy</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.warmCream },
  keyboardAvoiding: { flex: 1 },
  loginDecor: { ...StyleSheet.absoluteFillObject, overflow: "hidden" },
  decorOrbTop: {
    position: "absolute",
    top: "14%",
    left: -120,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: colors.lightSage,
    opacity: 0.38,
  },
  decorOrbBottom: {
    position: "absolute",
    top: "48%",
    right: -150,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: colors.sageGreen,
    opacity: 0.12,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.lg,
  },
  content: {
    width: "100%",
    maxWidth: 420,
    flex: 1,
    justifyContent: "space-between",
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
  },
  brand: { alignItems: "center" },
  form: { gap: spacing.lg },
  headingGroup: { gap: spacing.sm },
  eyebrow: {
    ...typography.caption,
    color: colors.primaryGreen,
    fontWeight: "700",
    letterSpacing: 1,
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "600",
    letterSpacing: -0.6,
    color: colors.forestGreen,
  },
  serviceRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, paddingTop: spacing.xxs },
  serviceChip: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.lightSage,
    borderWidth: 1,
    borderColor: colors.border,
  },
  serviceText: { ...typography.caption, color: colors.forestGreen, fontWeight: "600" },
  fieldGroup: { gap: spacing.xs },
  fieldLabel: { ...typography.label, color: colors.mainText, fontWeight: "600" },
  phoneRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
  },
  phoneRowError: { borderColor: colors.danger },
  phoneRowFocused: { borderColor: colors.primaryGreen, borderWidth: 1.5 },
  countryCode: {
    minHeight: sizes.touchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.xxs,
  },
  flag: { fontSize: 18 },
  countryText: { ...typography.bodyBold, fontSize: 15, color: colors.mainText },
  fieldDivider: { width: 1, height: 26, backgroundColor: colors.border, marginHorizontal: spacing.xs },
  phoneInput: {
    flex: 1,
    minHeight: sizes.touchTarget,
    ...typography.body,
    fontSize: 15,
    color: colors.text,
    paddingVertical: 0,
  },
  errorText: { ...typography.caption, color: colors.danger },
  cta: { minHeight: 54, backgroundColor: colors.forestGreen },
  legal: { alignItems: "center", gap: spacing.xxs },
  legalIntro: { ...typography.caption, color: colors.secondaryText },
  legalLinks: { flexDirection: "row", alignItems: "center", gap: spacing.xxs },
  legalLink: { ...typography.caption, color: colors.forestGreen, fontWeight: "700", textDecorationLine: "underline" },
});
