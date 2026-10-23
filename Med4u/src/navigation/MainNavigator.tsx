import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { HomeScreen } from "../screens/home/HomeScreen";
import { DoctorListScreen } from "../screens/doctor/DoctorListScreen";
import { DoctorDetailScreen } from "../screens/doctor/DoctorDetailScreen";
import { BookDoctorScreen } from "../screens/doctor/BookDoctorScreen";
import { VideoConsultScreen } from "../screens/doctor/VideoConsultScreen";
import { OrderMedicineScreen } from "../screens/medicine/OrderMedicineScreen";
import { CartScreen } from "../screens/medicine/CartScreen";
import { CheckoutScreen } from "../screens/medicine/CheckoutScreen";
import { MedicineDetailScreen } from "../screens/medicine/MedicineDetailScreen";
import { OrdersScreen } from "../screens/medicine/OrdersScreen";
import { OrderDetailScreen } from "../screens/medicine/OrderDetailScreen";
import { OrderConfirmationScreen } from "../screens/medicine/OrderConfirmationScreen";
import { useCartRestore } from "../hooks/useCartRestore";
import { useAuthStore } from "../store/authStore";
import { PharmacyConsoleScreen } from "../screens/pharmacy/PharmacyConsoleScreen";
import { PharmacyPrescriptionScreen } from "../screens/pharmacy/PharmacyPrescriptionScreen";
import { PharmacyOrderScreen } from "../screens/pharmacy/PharmacyOrderScreen";
import { BookTestScreen } from "../screens/lab/BookTestScreen";
import { LabTestDetailScreen } from "../screens/lab/LabTestDetailScreen";
import { LabBookingConfirmationScreen } from "../screens/lab/LabBookingConfirmationScreen";
import { ReportsScreen } from "../screens/lab/ReportsScreen";
import { PrescriptionScreen } from "../screens/prescription/PrescriptionScreen";
import { PrescriptionDetailScreen } from "../screens/prescription/PrescriptionDetailScreen";
import { NotificationsScreen } from "../screens/notifications/NotificationsScreen";
import { OrderFromPrescriptionScreen } from "../screens/prescription/OrderFromPrescriptionScreen";
import { AppointmentsScreen } from "../screens/appointments/AppointmentsScreen";
import { AppointmentReviewScreen } from "../screens/appointments/AppointmentReviewScreen";
import { AppointmentConfirmationScreen } from "../screens/appointments/AppointmentConfirmationScreen";
import { EditProfileScreen } from "../screens/profile/EditProfileScreen";
import { ProfileScreen } from "../screens/profile/ProfileScreen";
import { SettingsScreen } from "../screens/profile/SettingsScreen";
import { colors } from "../theme/colors";
import { MainStackParamList } from "../types/navigation";

const Stack = createNativeStackNavigator<MainStackParamList>();

export function MainNavigator() {
  useCartRestore();
  // Pharmacy staff land on their console; the server still authorizes every staff call.
  const isStaff = useAuthStore(
    (s) => s.user?.role === "pharmacist" || s.user?.role === "admin",
  );
  return (
    <Stack.Navigator
      initialRouteName={isStaff ? "PharmacyConsole" : "Home"}
      screenOptions={{
        headerTitleStyle: { fontWeight: "700", color: colors.text },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="DoctorList"
        component={DoctorListScreen}
        options={{ title: "Find Doctors" }}
      />
      <Stack.Screen
        name="DoctorDetail"
        component={DoctorDetailScreen}
        options={{ title: "Doctor Profile" }}
      />
      <Stack.Screen
        name="BookDoctor"
        component={BookDoctorScreen}
        options={{ title: "Book Appointment" }}
      />
      <Stack.Screen
        name="AppointmentReview"
        component={AppointmentReviewScreen}
        options={{ title: "Review appointment" }}
      />
      <Stack.Screen
        name="AppointmentConfirmation"
        component={AppointmentConfirmationScreen}
        options={{
          title: "Appointment status",
          headerBackVisible: false,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="VideoConsult"
        component={VideoConsultScreen}
        options={{ title: "Video Consult", headerShown: false }}
      />
      <Stack.Screen
        name="OrderMedicine"
        component={OrderMedicineScreen}
        options={{ title: "Medicines" }}
      />
      <Stack.Screen
        name="MedicineDetail"
        component={MedicineDetailScreen}
        options={{ title: "Medicine details" }}
      />
      <Stack.Screen
        name="Cart"
        component={CartScreen}
        options={{ title: "Your cart" }}
      />
      <Stack.Screen
        name="Checkout"
        component={CheckoutScreen}
        options={{ title: "Checkout" }}
      />
      <Stack.Screen
        name="Orders"
        component={OrdersScreen}
        options={{ title: "My orders" }}
      />
      <Stack.Screen
        name="PharmacyConsole"
        component={PharmacyConsoleScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="PharmacyPrescription"
        component={PharmacyPrescriptionScreen}
        options={{ title: "Review prescription" }}
      />
      <Stack.Screen
        name="PharmacyOrder"
        component={PharmacyOrderScreen}
        options={{ title: "Manage order" }}
      />
      <Stack.Screen
        name="OrderDetail"
        component={OrderDetailScreen}
        options={{ title: "Order details" }}
      />
      <Stack.Screen
        name="OrderConfirmation"
        component={OrderConfirmationScreen}
        options={{
          title: "Order confirmation",
          headerBackVisible: false,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="BookTest"
        component={BookTestScreen}
        options={{ title: "Lab tests" }}
      />
      <Stack.Screen
        name="LabTestDetail"
        component={LabTestDetailScreen}
        options={{ title: "Test details" }}
      />
      <Stack.Screen
        name="LabBookingConfirmation"
        component={LabBookingConfirmationScreen}
        options={{
          title: "Booking status",
          headerBackVisible: false,
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="Reports"
        component={ReportsScreen}
        options={{ title: "Lab Reports" }}
      />
      <Stack.Screen
        name="Prescription"
        component={PrescriptionScreen}
        options={{ title: "Prescriptions" }}
      />
      <Stack.Screen
        name="PrescriptionDetail"
        component={PrescriptionDetailScreen}
        options={{ title: "Prescription" }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: "Notifications" }}
      />
      <Stack.Screen name="OrderFromPrescription" component={OrderFromPrescriptionScreen} options={{ title: "Order prescribed medicines" }} />
      <Stack.Screen
        name="Appointments"
        component={AppointmentsScreen}
        options={{ title: "My Appointments" }}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ title: "My Profile" }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: "Settings" }}
      />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ title: "Edit Profile" }}
      />
    </Stack.Navigator>
  );
}
