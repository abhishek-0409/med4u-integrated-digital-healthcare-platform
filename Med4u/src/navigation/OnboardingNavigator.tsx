import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ErrorState } from "../components/ui/ErrorState";
import { Loader } from "../components/ui/Loader";
import { AccountReadyScreen } from "../screens/onboarding/AccountReadyScreen";
import { AdditionalInfoScreen } from "../screens/onboarding/AdditionalInfoScreen";
import { BasicDetailsScreen } from "../screens/onboarding/BasicDetailsScreen";
import { HealthInfoScreen } from "../screens/onboarding/HealthInfoScreen";
import { toApiError } from "../services/api/errors";
import { userService } from "../services/user.service";
import { useAuthStore } from "../store/authStore";
import { useOnboardingStore } from "../store/onboardingStore";
import { colors } from "../theme/colors";
import { OnboardingStackParamList } from "../types/navigation";
import { OnboardingStep, firstIncompleteStep } from "../utils/profileForm";

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

/**
 * Loads the account's saved profile from the backend before showing any form, so a user who quit
 * mid-way resumes at the first step that still lacks required data, with their saved answers filled in.
 */
export function OnboardingNavigator() {
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);
  const seed = useOnboardingStore((state) => state.seed);
  const [initialStep, setInitialStep] = useState<OnboardingStep | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const profile = await userService.getProfile();
      setUser(profile);
      seed(profile);
      setInitialStep(firstIncompleteStep(profile));
    } catch (err) {
      setError(toApiError(err).message);
    }
  }, [seed, setUser]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.warmCream }}>
        <ErrorState title="Couldn't load your profile" message={error} onRetry={() => void load()} />
      </View>
    );
  }
  if (!initialStep) {
    return <Loader />;
  }

  return (
    <Stack.Navigator
      initialRouteName={initialStep}
      screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.warmCream } }}
    >
      <Stack.Screen name="BasicDetails" component={BasicDetailsScreen} />
      <Stack.Screen name="HealthInfo" component={HealthInfoScreen} />
      <Stack.Screen name="AdditionalInfo" component={AdditionalInfoScreen} />
      <Stack.Screen name="AccountReady" component={AccountReadyScreen} options={{ gestureEnabled: false }} />
    </Stack.Navigator>
  );
}
