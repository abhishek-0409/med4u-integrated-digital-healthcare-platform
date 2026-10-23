import React, { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Activity, LockKeyhole, Phone, Stethoscope } from "lucide-react-native";
import { ActionButton, Card } from "../components/ui";
import { useAuth } from "../auth/authContext";
import { doctorApi } from "../api/client";
import { colors, round, space, type } from "../theme/tokens";
import { normalizePhone } from "../utils/phone";

const DEMO_PHONE = "+911111111112";

export function LoginScreen() {
  const { status, phone: requestedPhone, error, working, requestOtp, verifyOtp, retryRestore, logout } = useAuth();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [retrySeconds, setRetrySeconds] = useState(0);
  const [registering, setRegistering] = useState(false);
  const otpPending = status === "otpPending" || (status === "working" && Boolean(requestedPhone));
  const unavailable = status === "unavailable";
  const rejected = status === "rejected";

  useEffect(() => {
    if (retrySeconds <= 0) return undefined;
    const timer = setTimeout(() => setRetrySeconds((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [retrySeconds]);

  const normalizedPhone = normalizePhone;
  const isDemoNumber = __DEV__ && normalizePhone(phone) === DEMO_PHONE;
  const send = async () => {
    const value = normalizedPhone(phone);
    try {
      await requestOtp(value);
      setPhone(value);
      setOtp("");
      setRetrySeconds(60);
    } catch { /* Error is displayed from auth state. */ }
  };
  const verify = async () => {
    try { await verifyOtp(requestedPhone, otp); }
    catch { /* Error is displayed from auth state. */ }
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.brandBlock}>
          <View style={styles.logo}><Stethoscope size={25} color={colors.card} /></View>
          <Text style={styles.brand}>Med4U <Text style={styles.brandLight}>Doctor</Text></Text>
          <Text style={styles.tagline}>A secure workspace for your care team.</Text>
        </View>

        <Card style={styles.form}>
          {otpPending ? (
            <>
              <View style={styles.backRow}>
                <Text style={styles.title}>Verify your number</Text>
                <Text style={styles.phoneSummary}>{requestedPhone}</Text>
              </View>
              <Text style={styles.subtitle}>Enter the 6-digit code sent to your phone.</Text>
              <View style={styles.fieldWrap}>
                <Text style={styles.label}>One-time code</Text>
                <View style={styles.inputRow}>
                  <LockKeyhole size={18} color={colors.muted} />
                  <TextInput
                    style={styles.inputInline}
                    value={otp}
                    onChangeText={(value) => setOtp(value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="6-digit code"
                    placeholderTextColor={colors.muted}
                    keyboardType="number-pad"
                    textContentType="oneTimeCode"
                    maxLength={6}
                    accessibilityLabel="6-digit verification code"
                    autoFocus
                  />
                </View>
              </View>
              <ActionButton label={working ? "Verifying…" : "Verify and continue"} onPress={() => void verify()} disabled={working || otp.length !== 6} />
              <View style={styles.resendRow}>
                <Text style={styles.resendHint}>Didn’t receive a code?</Text>
                <Text onPress={() => { if (!working && retrySeconds === 0) void send(); }} style={[styles.resend, (working || retrySeconds > 0) && styles.resendDisabled]}>
                  {retrySeconds > 0 ? `Resend in ${retrySeconds}s` : "Resend code"}
                </Text>
              </View>
              <Text onPress={() => { setOtp(""); void retryRestore(); }} style={styles.changePhone}>Use a different account</Text>
            </>
          ) : unavailable ? (
            <>
              <Text style={styles.title}>Connection required</Text>
              <Text style={styles.subtitle}>{error ?? "We couldn’t verify your doctor account."}</Text>
              <ActionButton label={working ? "Checking…" : "Try again"} onPress={() => void retryRestore()} disabled={working} />
              <Text onPress={() => void logout()} style={styles.secondaryLink}>Sign out and use another account</Text>
            </>
          ) : (
            <>
              <View style={styles.heading}>
                <Text style={styles.title}>{registering ? "Register as a doctor" : "Sign in to your account"}</Text>
                <Text style={styles.subtitle}>
                  {registering
                    ? "Verify your mobile number to start your application. A reviewer checks every application by hand."
                    : "Use the phone number registered to your verified doctor account."}
                </Text>
              </View>
              <View style={styles.fieldWrap}>
                <Text style={styles.label}>Phone number</Text>
                <View style={styles.inputRow}>
                  <Phone size={18} color={colors.muted} />
                  <TextInput
                    style={styles.inputInline}
                    value={phone}
                    onChangeText={setPhone}
                    placeholder="+91 98765 43210"
                    placeholderTextColor={colors.muted}
                    keyboardType="phone-pad"
                    textContentType="telephoneNumber"
                    autoComplete="tel"
                    accessibilityLabel="Phone number including country code"
                  />
                </View>
                <Text style={styles.helper}>Include your country code, for example +91.</Text>
              </View>
              <ActionButton label={working ? "Sending code…" : "Continue with phone"} onPress={() => void send()} disabled={working || !phone.trim()} />
              {rejected ? <Text style={styles.rejectedHint}>Doctor access is limited to an active, verified doctor account with a linked non-demo profile.</Text> : null}
              <Text style={styles.terms}>By continuing, you agree to the account terms and privacy policy.</Text>
            </>
          )}
          {working ? <ActivityIndicator color={colors.forest} style={styles.spinner} /> : null}
          {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
          {!doctorApi.isConfigured ? <Text style={styles.configHint}>Set EXPO_PUBLIC_API_URL to the Med4U API origin to sign in.</Text> : null}
        </Card>

        <View style={styles.footer}>
          <Activity size={15} color={colors.green} />
          <Text style={styles.footerText}>Your account is verified securely with Med4U.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  page: { flexGrow: 1, justifyContent: "center", padding: space.lg, gap: space.xl },
  brandBlock: { alignItems: "center", gap: space.xs },
  logo: { width: 54, height: 54, alignItems: "center", justifyContent: "center", borderRadius: round.lg, backgroundColor: colors.forest },
  brand: { fontSize: 25, lineHeight: 31, fontWeight: "800", color: colors.forest },
  brandLight: { fontWeight: "500", color: colors.green },
  tagline: { ...type.body, color: colors.muted, textAlign: "center" },
  form: { gap: space.lg },
  heading: { gap: space.xs },
  backRow: { gap: 3 },
  title: { ...type.title, fontSize: 23, lineHeight: 30 },
  subtitle: { ...type.body, color: colors.muted },
  phoneSummary: { ...type.body, color: colors.forest, fontWeight: "600" },
  fieldWrap: { gap: 6 },
  label: { ...type.label },
  inputRow: { minHeight: 50, flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, borderRadius: round.md, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
  inputInline: { flex: 1, minHeight: 48, color: colors.text, fontSize: 16 },
  helper: { ...type.caption },
  resendRow: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 5, flexWrap: "wrap" },
  resendHint: { ...type.caption },
  resend: { ...type.caption, color: colors.green, fontWeight: "700" },
  resendDisabled: { color: colors.muted },
  changePhone: { ...type.caption, textAlign: "center", color: colors.green, fontWeight: "600" },
  registerLink: { ...type.label, textAlign: "center", color: colors.green, paddingVertical: space.xs },
  demoHint: { ...type.caption, color: colors.warning, fontWeight: "700" },
  secondaryLink: { ...type.caption, textAlign: "center", color: colors.green, fontWeight: "600" },
  rejectedHint: { ...type.caption, color: colors.warning, textAlign: "center" },
  terms: { ...type.caption, textAlign: "center", marginTop: 2 },
  spinner: { marginTop: -space.sm },
  error: { fontSize: 13, lineHeight: 18, color: colors.danger, textAlign: "center" },
  configHint: { ...type.caption, textAlign: "center", color: colors.warning },
  footer: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 6 },
  footerText: { ...type.caption },
});
