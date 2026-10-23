import React, { useState } from "react";
import { StyleSheet, Text } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ruler, Scale } from "lucide-react-native";
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
import { parseDecimal, validateHeight, validateWeight } from "../../utils/profileForm";

type Props = NativeStackScreenProps<OnboardingStackParamList, "AdditionalInfo">;

const ICON = { size: 20, color: colors.forestGreen } as const;

export function AdditionalInfoScreen({ navigation }: Props) {
  const user = useAuthStore((state) => state.user);
  const { height, weight, setField } = useOnboardingStore();
  const { save, saving, failure, clearFailure } = useProfileSave();
  const [errors, setErrors] = useState<{ height?: string; weight?: string }>({});

  const goToDone = () => navigation.navigate("AccountReady");

  const onContinue = async () => {
    if (saving) return;
    const found = {
      height: validateHeight(height) ?? undefined,
      weight: validateWeight(weight) ?? undefined,
    };
    setErrors(found);
    if (found.height || found.weight) return;

    // Empty fields are left alone, except that clearing a previously saved value sends null.
    const changes: UpdateProfileRequest = {};
    const heightCm = parseDecimal(height);
    const weightKg = parseDecimal(weight);
    if (heightCm !== (user?.heightCm ?? null)) changes.heightCm = heightCm;
    if (weightKg !== (user?.weightKg ?? null)) changes.weightKg = weightKg;

    if (Object.keys(changes).length > 0 && !(await save(changes))) return;
    goToDone();
  };

  return (
    <OnboardingLayout
      step={3}
      title="Additional Information (Optional)"
      subtitle="This helps us offer more relevant services."
      onBack={navigation.goBack}
      footer={
        <>
          {failure ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {failure.message}
            </Text>
          ) : null}
          <Button title="Skip" variant="secondary" style={styles.skip} disabled={saving} onPress={goToDone} />
          <Button title="Continue" loading={saving} onPress={() => void onContinue()} />
        </>
      }
    >
      <Input
        label="Height (optional)"
        value={height}
        onChangeText={(value) => {
          setField("height", value);
          setErrors((current) => ({ ...current, height: undefined }));
          clearFailure();
        }}
        placeholder="Enter height (cm)"
        keyboardType="decimal-pad"
        maxLength={5}
        leftElement={<Ruler {...ICON} />}
        error={errors.height}
      />
      <Input
        label="Weight (optional)"
        value={weight}
        onChangeText={(value) => {
          setField("weight", value);
          setErrors((current) => ({ ...current, weight: undefined }));
          clearFailure();
        }}
        placeholder="Enter weight (kg)"
        keyboardType="decimal-pad"
        maxLength={5}
        leftElement={<Scale {...ICON} />}
        error={errors.weight}
      />
    </OnboardingLayout>
  );
}

const styles = StyleSheet.create({
  skip: { backgroundColor: colors.lightSage, borderColor: colors.lightSage },
  error: { ...typography.caption, color: colors.danger, textAlign: "center" },
});
