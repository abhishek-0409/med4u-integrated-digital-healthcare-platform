import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../../components/ui/Button";
import { ErrorState } from "../../components/ui/ErrorState";
import { Input } from "../../components/ui/Input";
import { Loader } from "../../components/ui/Loader";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useAuth } from "../../hooks/useAuth";
import { toApiError } from "../../services/api/errors";
import { userService } from "../../services/user.service";
import { colors } from "../../theme/colors";
import { radius, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { AuthUser, BloodGroup, Gender, UpdateProfileRequest } from "../../types/auth";
import { MainStackParamList } from "../../types/navigation";
import { isValidPastDate } from "../../utils/helpers";

type Props = NativeStackScreenProps<MainStackParamList, "EditProfile">;

const GENDERS: Array<{ value: Gender; label: string }> = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

const BLOOD_GROUPS: BloodGroup[] = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormState {
  name: string;
  email: string;
  dob: string;
  gender: Gender | null;
  bloodGroup: BloodGroup | null;
}

const toForm = (user: AuthUser): FormState => ({
  // A brand-new account has its phone number as a placeholder name.
  name: user.name === user.phone ? "" : user.name,
  email: user.email ?? "",
  dob: user.dob ?? "",
  gender: user.gender ?? null,
  bloodGroup: user.bloodGroup ?? null,
});

type FieldErrors = Partial<Record<"name" | "email" | "dob", string>>;

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  const name = form.name.trim();
  if (name.length < 2 || name.length > 100) {
    errors.name = "Enter your name (2–100 characters).";
  }
  if (form.email.trim() && !EMAIL_PATTERN.test(form.email.trim())) {
    errors.email = "Enter a valid email address.";
  }
  if (form.dob.trim() && !isValidPastDate(form.dob.trim())) {
    errors.dob = "Use the format YYYY-MM-DD, for a date in the past.";
  }
  return errors;
}

/** Sends only the fields that changed; cleared optional fields are sent as null. */
function diff(original: FormState, next: FormState): UpdateProfileRequest {
  const changes: UpdateProfileRequest = {};
  if (next.name.trim() !== original.name.trim()) changes.name = next.name.trim();
  if (next.email.trim() !== original.email.trim()) changes.email = next.email.trim() || null;
  if (next.dob.trim() !== original.dob.trim()) changes.dob = next.dob.trim() || null;
  if (next.gender !== original.gender) changes.gender = next.gender;
  if (next.bloodGroup !== original.bloodGroup) changes.bloodGroup = next.bloodGroup;
  return changes;
}

export function EditProfileScreen({ navigation }: Props) {
  const { setUser } = useAuth();
  const { data: profile, loading, error, reload } = useAsyncData(() => userService.getProfile(), []);

  if (loading) {
    return <Loader />;
  }
  if (error || !profile) {
    return <ErrorState message={error ?? "Couldn't load your profile."} onRetry={reload} />;
  }

  return (
    <EditProfileForm
      profile={profile}
      onSaved={(user) => {
        setUser(user);
        navigation.goBack();
      }}
    />
  );
}

function EditProfileForm({ profile, onSaved }: { profile: AuthUser; onSaved: (user: AuthUser) => void }) {
  const original = toForm(profile);
  const [form, setForm] = useState<FormState>(original);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setSaveError(null);
  };

  const onSave = async () => {
    if (saving) {
      return;
    }
    const fieldErrors = validate(form);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length > 0) {
      return;
    }
    const changes = diff(original, form);
    if (Object.keys(changes).length === 0) {
      onSaved(profile);
      return;
    }
    setSaving(true);
    try {
      onSaved(await userService.updateProfile(changes));
    } catch (err) {
      setSaveError(toApiError(err).message);
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Input
          label="Full name"
          value={form.name}
          onChangeText={(value) => update("name", value)}
          placeholder="Your name"
          maxLength={100}
          autoCapitalize="words"
          error={errors.name}
        />
        <Input
          label="Email (optional)"
          value={form.email}
          onChangeText={(value) => update("email", value)}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          error={errors.email}
        />
        <Input
          label="Date of birth (optional)"
          value={form.dob}
          onChangeText={(value) => update("dob", value)}
          placeholder="YYYY-MM-DD"
          keyboardType="number-pad"
          maxLength={10}
          error={errors.dob}
        />

        <ChipGroup
          label="Gender"
          options={GENDERS}
          selected={form.gender}
          onSelect={(value) => update("gender", value)}
        />
        <ChipGroup
          label="Blood group"
          options={BLOOD_GROUPS.map((value) => ({ value, label: value === "unknown" ? "Unknown" : value }))}
          selected={form.bloodGroup}
          onSelect={(value) => update("bloodGroup", value)}
        />

        {saveError ? <Text style={styles.errorText}>{saveError}</Text> : null}

        <Button title="Save changes" loading={saving} onPress={onSave} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function ChipGroup<T extends string>({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: Array<{ value: T; label: string }>;
  selected: T | null;
  onSelect: (value: T | null) => void;
}) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupLabel}>{label}</Text>
      <View style={styles.chips}>
        {options.map((option) => {
          const active = selected === option.value;
          return (
            <Pressable
              key={option.value}
              style={[styles.chip, active && styles.chipActive]}
              // Tapping the selected chip again clears the field.
              onPress={() => onSelect(active ? null : option.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  group: {
    gap: spacing.xs,
  },
  groupLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipActive: {
    backgroundColor: colors.primaryDark,
    borderColor: colors.primaryDark,
  },
  chipText: {
    ...typography.caption,
    color: colors.text,
  },
  chipTextActive: {
    color: colors.white,
    fontWeight: "600",
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
    textAlign: "center",
  },
});
