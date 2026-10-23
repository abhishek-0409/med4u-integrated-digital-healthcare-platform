import React, { useEffect } from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Loader } from "../components/ui/Loader";
import { useAuthStore } from "../store/authStore";
import { RootStackParamList } from "../types/navigation";
import { AuthNavigator } from "./AuthNavigator";
import { MainNavigator } from "./MainNavigator";
import { OnboardingNavigator } from "./OnboardingNavigator";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const needsOnboarding = useAuthStore((state) => state.needsOnboarding);
  const isRestoring = useAuthStore((state) => state.isRestoring);
  const restoreSession = useAuthStore((state) => state.restoreSession);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  if (isRestoring) {
    return <Loader />;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        needsOnboarding ? (
          <Stack.Screen name="OnboardingFlow" component={OnboardingNavigator} />
        ) : (
          <Stack.Screen name="MainFlow" component={MainNavigator} />
        )
      ) : (
        <Stack.Screen name="AuthFlow" component={AuthNavigator} />
      )}
    </Stack.Navigator>
  );
}
