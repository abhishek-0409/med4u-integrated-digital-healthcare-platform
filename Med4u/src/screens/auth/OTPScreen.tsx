import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  View,
  useWindowDimensions,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { Button } from "../../components/ui/Button";
import { useAuth } from "../../hooks/useAuth";
import { colors } from "../../theme/colors";
import { layout, radius, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { AuthStackParamList } from "../../types/navigation";

type Props = NativeStackScreenProps<AuthStackParamList, "OTP">;

const OTP_LENGTH = 6;
const RESEND_COOLDOWN_S = 60;

export function OTPScreen({ route, navigation }: Props) {
  const { phone } = route.params;
  const { width } = useWindowDimensions();
  const [otp, setOtp] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(RESEND_COOLDOWN_S);
  const [resending, setResending] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRefs = useRef<Array<TextInput | null>>(Array(OTP_LENGTH).fill(null));
  const { requestOtp, verifyOtp, clearError, isLoading, error } = useAuth();
  const displayedError = validationError ?? error;
  const canResend = secondsRemaining === 0;
  const allFilled = otp.every((digit) => digit.length === 1);
  const maskedPhone =
    phone.length >= 8
      ? `${phone.slice(0, 3)} •••••• ${phone.slice(-4)}`
      : "your number";
  const boxWidth = Math.min(
    52,
    Math.max(
      32,
      Math.floor(
        (width - 2 * layout.screenPadding - (OTP_LENGTH - 1) * spacing.xs) /
          OTP_LENGTH,
      ),
    ),
  );

  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

  useEffect(() => {
    if (secondsRemaining <= 0) return;
    const timer = setTimeout(() => setSecondsRemaining((current) => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsRemaining]);

  const updateOtp = (value: string, index: number) => {
    const digits = value.replace(/\D/g, "");
    const nextOtp = [...otp];

    if (digits.length > 1) {
      const pasted = digits.slice(0, OTP_LENGTH - index);
      pasted.split("").forEach((digit, offset) => {
        nextOtp[index + offset] = digit;
      });
      setOtp(nextOtp);
      setValidationError(null);
      clearError();
      const nextIndex = Math.min(index + pasted.length, OTP_LENGTH - 1);
      inputRefs.current[nextIndex]?.focus();
      return;
    }

    nextOtp[index] = digits;
    setOtp(nextOtp);
    setValidationError(null);
    clearError();
    if (digits && index < OTP_LENGTH - 1) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyPress = (
    event: NativeSyntheticEvent<TextInputKeyPressEventData>,
    index: number,
  ) => {
    if (event.nativeEvent.key === "Backspace" && !otp[index] && index > 0) {
      const nextOtp = [...otp];
      nextOtp[index - 1] = "";
      setOtp(nextOtp);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const onVerify = async () => {
    if (!allFilled) {
      setValidationError("Enter the 6-digit code to continue.");
      return;
    }
    setValidationError(null);
    clearError();
    try {
      await verifyOtp(phone, otp.join(""));
    } catch {
      // The auth store exposes the API/network error below the code fields.
    }
  };

  const onResend = async () => {
    if (!canResend || isLoading) return;
    setResending(true);
    setValidationError(null);
    clearError();
    try {
      await requestOtp(phone);
      setOtp(Array(OTP_LENGTH).fill(""));
      setSecondsRemaining(RESEND_COOLDOWN_S);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    } catch {
      // Keep resend enabled so the user can retry after a network/API failure.
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
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
            <Pressable
              onPress={() => navigation.goBack()}
              hitSlop={10}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Back to mobile number"
            >
              <ArrowLeft size={22} color={colors.forestGreen} />
            </Pressable>

            <View style={styles.headingGroup}>
              <Text style={styles.title} accessibilityRole="header">
                Enter verification code
              </Text>
              <Text style={styles.subtitle}>
                We sent a 6-digit code to your mobile number.
              </Text>
            </View>

            <View style={styles.destinationRow}>
              <View style={styles.destinationDetails}>
                <Text style={styles.destinationLabel}>Code sent to</Text>
                <Text style={styles.phone}>{maskedPhone}</Text>
              </View>
              <Pressable
                onPress={() => navigation.goBack()}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Change mobile number"
              >
                <Text style={styles.changeNumber}>Change</Text>
              </Pressable>
            </View>

            <View style={styles.codeSection}>
              <Text style={styles.codeLabel}>Verification code</Text>
              <View style={styles.otpRow}>
                {otp.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={(node) => {
                      inputRefs.current[index] = node;
                    }}
                    style={[
                      styles.otpBox,
                      { width: boxWidth },
                      focusedIndex === index && styles.otpBoxFocused,
                      digit !== "" && styles.otpBoxFilled,
                      Boolean(displayedError) && styles.otpBoxError,
                    ]}
                    value={digit}
                    onChangeText={(value) => updateOtp(value, index)}
                    onKeyPress={(event) => handleKeyPress(event, index)}
                    onFocus={() => setFocusedIndex(index)}
                    onBlur={() => setFocusedIndex(-1)}
                    keyboardType="number-pad"
                    maxLength={OTP_LENGTH}
                    selectTextOnFocus
                    textContentType={index === 0 ? "oneTimeCode" : "none"}
                    autoComplete={index === 0 ? "sms-otp" : "off"}
                    accessibilityLabel={`Code digit ${index + 1} of ${OTP_LENGTH}`}
                    accessibilityHint="Enter the verification code sent by SMS"
                  />
                ))}
              </View>

              {displayedError ? (
                <Text style={styles.errorText} accessibilityLiveRegion="polite">
                  {displayedError}
                </Text>
              ) : null}
            </View>

            <View style={styles.resendGroup}>
              <Text style={styles.resendPrompt}>Didn’t receive a code?</Text>
              <Pressable
                onPress={() => void onResend()}
                disabled={!canResend || isLoading}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canResend || isLoading }}
                hitSlop={8}
              >
                <Text
                  style={[
                    styles.resendLink,
                    (!canResend || isLoading) && styles.resendDisabled,
                  ]}
                >
                  {resending
                    ? "Sending…"
                    : canResend
                      ? "Resend code"
                      : `Resend in 00:${String(secondsRemaining).padStart(2, "0")}`}
                </Text>
              </Pressable>
            </View>

            <Button
              title="Verify & continue"
              loading={isLoading && !resending}
              disabled={isLoading}
              onPress={() => void onVerify()}
              style={styles.cta}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.warmCream },
  keyboardAvoiding: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: layout.screenPadding,
    paddingVertical: spacing.md,
  },
  content: {
    width: "100%",
    maxWidth: 420,
    flex: 1,
    alignSelf: "center",
    justifyContent: "flex-start",
    gap: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  backButton: {
    alignSelf: "flex-start",
    width: 44,
    height: 44,
    justifyContent: "center",
  },
  headingGroup: { alignSelf: "stretch", alignItems: "flex-start", gap: spacing.xs },
  title: { ...typography.h2, color: colors.forestGreen },
  subtitle: { ...typography.body, color: colors.secondaryText, lineHeight: 23 },
  destinationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  destinationDetails: { flex: 1, gap: 2 },
  destinationLabel: { ...typography.caption, color: colors.secondaryText },
  phone: {
    ...typography.bodyBold,
    fontSize: 14,
    letterSpacing: 0.4,
    color: colors.forestGreen,
  },
  changeNumber: { ...typography.caption, color: colors.primaryGreen, fontWeight: "700" },
  codeSection: { width: "100%", gap: spacing.xs, alignItems: "center" },
  codeLabel: { ...typography.label, color: colors.mainText, alignSelf: "flex-start" },
  otpRow: { flexDirection: "row", justifyContent: "center", gap: spacing.xs },
  otpBox: {
    height: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    color: colors.text,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "600",
    textAlign: "center",
    paddingVertical: 0,
    includeFontPadding: false,
  },
  otpBoxFocused: { borderColor: colors.forestGreen, borderWidth: 1.5 },
  otpBoxFilled: { backgroundColor: colors.lightSage },
  otpBoxError: { borderColor: colors.danger },
  errorText: { ...typography.caption, color: colors.danger, textAlign: "center" },
  resendGroup: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.xs,
  },
  resendPrompt: { ...typography.caption, color: colors.secondaryText, flexShrink: 1 },
  resendLink: { ...typography.bodyBold, color: colors.forestGreen },
  resendDisabled: { color: colors.secondaryText },
  cta: { minHeight: 54, backgroundColor: colors.forestGreen },
});
