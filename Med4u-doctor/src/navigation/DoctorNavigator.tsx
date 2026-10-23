import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { LoginScreen } from "../screens/LoginScreen";
import { ApplicationScreen } from "../screens/ApplicationScreen";
import { DashboardScreen } from "../screens/DashboardScreen";
import { AppointmentsScreen } from "../screens/AppointmentsScreen";
import { AppointmentDetailScreen } from "../screens/AppointmentDetailScreen";
import { AvailabilityScreen } from "../screens/AvailabilityScreen";
import { PatientDetailsScreen } from "../screens/PatientDetailsScreen";
import { VideoConsultScreen } from "../screens/VideoConsultScreen";
import { ConsultationSummaryScreen } from "../screens/ConsultationSummaryScreen";
import { PrescriptionEditorScreen } from "../screens/PrescriptionEditorScreen";
import { PrescriptionReviewScreen } from "../screens/PrescriptionReviewScreen";
import { PrescriptionDetailScreen } from "../screens/PrescriptionDetailScreen";
import { HistoryScreen } from "../screens/HistoryScreen";
import { ProfileScreen } from "../screens/ProfileScreen";
import { SettingsScreen } from "../screens/SettingsScreen";
import { DoctorStackParamList } from "../types/navigation";
import { colors } from "../theme/tokens";
import { useAuth } from "../auth/authContext";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { type } from "../theme/tokens";

const Stack = createNativeStackNavigator<DoctorStackParamList>();

export function DoctorNavigator() {
  const { status } = useAuth();
  const authenticated = status === "authenticated";
  const applicant = status === "applicant";
  return (
    <NavigationContainer>
      <Stack.Navigator
        key={authenticated ? "doctor-app" : applicant ? "applicant" : "auth-only"}
        initialRouteName={authenticated ? "Dashboard" : applicant ? "Application" : "Login"}
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: "slide_from_right",
        }}
      >
        {!authenticated && !applicant ? (
          <Stack.Screen name="Login" component={status === "restoring" ? AuthRestoringScreen : LoginScreen} />
        ) : null}
        {applicant ? <Stack.Screen name="Application" component={ApplicationScreen} /> : null}
        {authenticated ? <>
          <Stack.Screen name="Dashboard" component={DashboardScreen} />
          <Stack.Screen name="Appointments" component={AppointmentsScreen} />
          <Stack.Screen name="AppointmentDetail" component={AppointmentDetailScreen} />
          <Stack.Screen name="Availability" component={AvailabilityScreen} />
          <Stack.Screen name="PatientDetails" component={PatientDetailsScreen} />
          <Stack.Screen name="VideoConsult" component={VideoConsultScreen} />
          <Stack.Screen name="ConsultationSummary" component={ConsultationSummaryScreen} />
          <Stack.Screen name="PrescriptionEditor" component={PrescriptionEditorScreen} />
          <Stack.Screen name="PrescriptionReview" component={PrescriptionReviewScreen} />
          <Stack.Screen name="PrescriptionDetail" component={PrescriptionDetailScreen} />
          <Stack.Screen name="History" component={HistoryScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
        </> : null}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function AuthRestoringScreen() {
  return <View style={styles.restore}><ActivityIndicator color={colors.forest} /><Text style={type.body}>Verifying secure session…</Text></View>;
}

const styles = StyleSheet.create({ restore: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: colors.background } });
