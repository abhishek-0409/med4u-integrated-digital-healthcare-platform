import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Droplet, ShieldCheck } from "lucide-react-native";
import { OnboardingLayout } from "../../components/onboarding/OnboardingLayout";
import { OptionPills } from "../../components/onboarding/OptionPills";
import { SelectField } from "../../components/onboarding/SelectField";
import { Button } from "../../components/ui/Button";
import { useProfileSave } from "../../hooks/useProfileSave";
import { useAuthStore } from "../../store/authStore";
import { useOnboardingStore } from "../../store/onboardingStore";
import { colors } from "../../theme/colors";
import { radius, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { UpdateProfileRequest } from "../../types/auth";
import { OnboardingStackParamList } from "../../types/navigation";
import { BLOOD_GROUP_OPTIONS, GENDER_OPTIONS } from "../../utils/profileForm";

type Props = NativeStackScreenProps<OnboardingStackParamList, "HealthInfo">;

export function HealthInfoScreen({ navigation }: Props) {
  const user = useAuthStore((state) => state.user);
  const { bloodGroup, gender, setField } = useOnboardingStore();
  const { save, saving, failure, clearFailure } = useProfileSave();
  const [errors, setErrors] = useState<{ bloodGroup?: string; gender?: string }>({});

  const onContinue = async () => {
    if (saving) return;
    const found = {
      bloodGroup: bloodGroup ? undefined : "Select your blood group, or choose Unknown.",
      gender: gender ? undefined : "Select an option, or choose Prefer not to say.",
    };
    setErrors(found);
    if (found.bloodGroup || found.gender) return;

    const changes: UpdateProfileRequest = {};
    if (bloodGroup !== (user?.bloodGroup ?? null)) changes.bloodGroup = bloodGroup;
    if (gender !== (user?.gender ?? null)) changes.gender = gender;

    if (Object.keys(changes).length > 0 && !(await save(changes))) return;
    navigation.navigate("AdditionalInfo");
  };

  return (
    <OnboardingLayout
      step={2}
      title="Your Health Information"
      subtitle="Doctors use this to give you safer, more personalized care. Share only what you're comfortable with."
      onBack={navigation.canGoBack() ? navigation.goBack : undefined}
      footer={
        <>
          {failure ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {failure.message}
            </Text>
          ) : null}
          <Button title="Continue" loading={saving} onPress={() => void onContinue()} />
        </>
      }
    >
      <SelectField
        label="Blood Group"
        placeholder="Select blood group"
        options={BLOOD_GROUP_OPTIONS}
        value={bloodGroup}
        onChange={(value) => {
          setField("bloodGroup", value);
          setErrors((current) => ({ ...current, bloodGroup: undefined }));
          clearFailure();
        }}
        leftElement={<Droplet size={20} color={colors.forestGreen} />}
        error={errors.bloodGroup}
      />
      <OptionPills
        label="Gender"
        options={GENDER_OPTIONS}
        value={gender}
        onChange={(value) => {
          setField("gender", value);
          setErrors((current) => ({ ...current, gender: undefined }));
          clearFailure();
        }}
        error={errors.gender}
      />
      <View style={styles.notice}>
        <ShieldCheck size={26} color={colors.forestGreen} />
        <Text style={styles.noticeText}>
          Your information is safe and will be kept confidential.
        </Text>
      </View>
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.lightSage,
  },
  noticeText: { flex: 1, ...typography.body, color: colors.mainText },
  error: { ...typography.caption, color: colors.danger, textAlign: "center" },
});
