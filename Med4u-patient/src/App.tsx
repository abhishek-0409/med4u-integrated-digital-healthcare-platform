import React, { useEffect } from "react";
import { createNavigationContainerRef, NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { ConfigurationError } from "./components/ui/ConfigurationError";
import { env } from "./config/env";
import { AppNavigator } from "./navigation/AppNavigator";
import { colors } from "./theme/colors";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { useAuthStore } from "./store/authStore";
import { pushTokenService } from "./services/push-token.service";
import { RootStackParamList } from "./types/navigation";
import { openPrescriptionNotification } from "./utils/notificationNavigation";

const navigationRef = createNavigationContainerRef<RootStackParamList>();

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.card,
    text: colors.text,
    border: colors.border,
    notification: colors.danger,
  },
};

export default function App() {
  if (!env.apiUrl) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <ConfigurationError />
      </SafeAreaProvider>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer ref={navigationRef} theme={navigationTheme}>
          <StatusBar style="dark" />
          <AppNavigator />
        </NavigationContainer>
        <PushNotificationsSetup />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function PushNotificationsSetup() {
  const user = useAuthStore((s) => s.user);
  useEffect(() => {
    if (!user || user.role !== "patient" || !Device.isDevice) return;
    let active = true;
    const register = async () => {
      try {
        let permission = await Notifications.getPermissionsAsync();
        if (permission.status !== "granted" && permission.canAskAgain) permission = await Notifications.requestPermissionsAsync();
        if (!active || permission.status !== "granted") return;
        const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId ?? process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
        if (!projectId) return;
        const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        let deviceId = await SecureStore.getItemAsync("med4u.push.device-id");
        if (!deviceId) {
          deviceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
          await SecureStore.setItemAsync("med4u.push.device-id", deviceId);
        }
        if (active) await pushTokenService.register(token, deviceId);
      } catch { /* Network and permission failures leave in-app notifications available. */ }
    };
    void register();
    const openPrescription = (data: unknown) => openPrescriptionNotification(navigationRef, useAuthStore.getState().isAuthenticated, data);
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => openPrescription(response.notification.request.content.data));
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (active && response) openPrescription(response.notification.request.content.data);
    }).catch(() => undefined);
    return () => { active = false; subscription.remove(); };
  }, [user?.id, user?.role]);
  return null;
}
