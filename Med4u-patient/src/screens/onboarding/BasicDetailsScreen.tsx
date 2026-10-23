import React, { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { CalendarDays, Mail, User } from "lucide-react-native";
import { OnboardingLayout } from "../../components/onboarding/OnboardingLayout";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { useProfileSave } from "../../hooks/useProfileSave";
import { useAuthStore } from "../../store/authStore";
import { useOnboardingStore } from "../../store/onboardingStore";
import { colors } from "../../theme/colors";
import { typography } from "../../theme/typography";
import { UpdateProfileRequest } from "../../types/auth";
import { OnboardingStackParamList } from "../../types/navigation";
import {
  BasicDetailsErrors,
  ageLabelFromDobInput,
  dobInputToIso,
  formatDobInput,
  validateBasicDetails,
} from "../../utils/profileForm";

type Props = NativeStackScreenProps<OnboardingStackParamList, "BasicDetails">;

const ICON = { size: 20, color: colors.forestGreen } as const;

export function BasicDetailsScreen({ navigation }: Props) {
  const user = useAuthStore((state) => state.user);
  const { name, email, dob, setField } = useOnboardingStore();
  const { save, saving, failure, clearFailure } = useProfileSave();
  const [errors, setErrors] = useState<BasicDetailsErrors>({});

  const update = (field: "name" | "email" | "dob", value: string) => {
    setField(field, value);
    setErrors((current) => ({ ...current, [field]: undefined }));
    clearFailure();
  };

  const onContinue = async () => {
    if (saving) return;
    const found = validateBasicDetails({ name, email, dob });
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    // Send only what differs from the saved profile; nothing to send means it is already saved.
    const changes: UpdateProfileRequest = {};
    if (name.trim() !== user?.name) changes.name = name.trim();
    if (email.trim().toLowerCase() !== (user?.email ?? "").toLowerCase()) changes.email = email.trim();
    const dobIso = dobInputToIso(dob);
    if (dobIso !== (user?.dob ?? null)) changes.dob = dobIso;

    if (Object.keys(changes).length > 0 && !(await save(changes))) return;
    navigation.navigate("HealthInfo");
  };

  const emailError = errors.email ?? (failure?.emailTaken ? failure.message : undefined);
  const generalError = failure && !failure.emailTaken ? failure.message : null;
  const ageLabel = ageLabelFromDobInput(dob);

  return (
    <OnboardingLayout
      step={1}
      title="Tell us about yourself"
      subtitle="This helps us provide a better and personalized healthcare experience."
      footer={
        <>
          {generalError ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {generalError}
            </Text>
          ) : null}
          <Button title="Continue" loading={saving} onPress={() => void onContinue()} />
        </>
      }
    >
      <Input
        label="Full Name"
        value={name}
        onChangeText={(value) => update("name", value)}
        placeholder="Enter your full name"
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        maxLength={100}
        leftElement={<User {...ICON} />}
        error={errors.name}
      />
      <Input
        label="Email Address"
        value={email}
        onChangeText={(value) => update("email", value)}
        placeholder="name@example.invalid"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        maxLength={150}
        leftElement={<Mail {...ICON} />}
        error={emailError}
      />
      <Input
        label="Date of Birth / Age"
        value={dob}
        onChangeText={(value) => update("dob", formatDobInput(value))}
        placeholder="DD/MM/YYYY"
        keyboardType="number-pad"
        maxLength={10}
        leftElement={<CalendarDays {...ICON} />}
        error={errors.dob}
        hint={ageLabel ? `Age: ${ageLabel}` : "We will calculate your age automatically"}
      />
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  error: { ...typography.caption, color: colors.danger, textAlign: "center" },
});
