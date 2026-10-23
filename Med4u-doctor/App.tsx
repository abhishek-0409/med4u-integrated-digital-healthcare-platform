import React from "react";
import { StatusBar } from "expo-status-bar";
import { DoctorNavigator } from "./src/navigation/DoctorNavigator";
import { colors } from "./src/theme/tokens";
import { AuthProvider } from "./src/auth/authContext";

export default function App() {
  return (
    <>
      <StatusBar style="dark" backgroundColor={colors.background} />
      <AuthProvider>
        <DoctorNavigator />
      </AuthProvider>
    </>
  );
}
