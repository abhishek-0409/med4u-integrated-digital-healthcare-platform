import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Bell, CalendarDays, FileHeart } from "lucide-react-native";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { Screen } from "../../components/ui/Screen";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useRefreshOnFocus } from "../../hooks/useRefreshOnFocus";
import { notificationService } from "../../services/notification.service";
import { colors } from "../../theme/colors";
import { radius, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { MainStackParamList } from "../../types/navigation";
import { PatientNotification } from "../../types/notification";

type Props = NativeStackScreenProps<MainStackParamList, "Notifications">;

function timestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function prescriptionIdFor(notification: PatientNotification): string | null {
  if (notification.type !== "prescription_issued" && notification.type !== "prescription_ready") return null;
  const id = notification.data?.prescriptionId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

export function NotificationsScreen({ navigation }: Props) {
  const { data, loading, error, reload } = useAsyncData(() => notificationService.list(), []);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  useRefreshOnFocus(reload);

  useEffect(() => {
    setReadIds(new Set());
  }, [data]);

  const unreadCount = Math.max(
    0,
    (data?.unreadCount ?? 0) - (data?.data.filter((item) => !item.isRead && readIds.has(item.id)).length ?? 0),
  );

  const openNotification = async (notification: PatientNotification) => {
    if (openingId) return;
    setOpeningId(notification.id);
    setActionError(null);
    if (!notification.isRead && !readIds.has(notification.id)) {
      try {
        await notificationService.markRead(notification.id);
        setReadIds((current) => new Set(current).add(notification.id));
      } catch {
        setActionError("This notification could not be marked as read. You can try again later.");
      }
    }

    const prescriptionId = prescriptionIdFor(notification);
    if (prescriptionId) navigation.navigate("PrescriptionDetail", { prescriptionId });
    setOpeningId(null);
  };

  return (
    <Screen padded={false}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} />}
      >
        <View style={styles.heading}>
          <Text style={styles.title} accessibilityRole="header">Notifications</Text>
          <Text style={styles.subtitle}>{unreadCount ? `${unreadCount} unread` : "You’re all caught up"}</Text>
        </View>
        {actionError ? <Text style={styles.errorNotice} accessibilityRole="alert">{actionError}</Text> : null}
        {loading && !data ? (
          <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.subtitle}>Loading notifications…</Text></View>
        ) : error && !data ? (
          <ErrorState title="Couldn't load notifications" message={error} onRetry={reload} />
        ) : data?.data.length ? (
          <View style={styles.list}>
            {data.data.map((notification) => {
              const isRead = notification.isRead || readIds.has(notification.id);
              const isPrescription = notification.type === "prescription_issued" || notification.type === "prescription_ready";
              const Icon = isPrescription ? FileHeart : notification.type === "appointment_reminder" ? CalendarDays : Bell;
              return (
                <Pressable
                  key={notification.id}
                  onPress={() => void openNotification(notification)}
                  disabled={openingId === notification.id}
                  accessibilityRole="button"
                  accessibilityLabel={`${notification.title}. ${isRead ? "Read" : "Unread"}. ${timestamp(notification.createdAt)}`}
                  style={({ pressed }) => [styles.item, !isRead && styles.unreadItem, pressed && styles.pressed]}
                >
                  <View style={styles.iconWrap}><Icon size={21} color={colors.primaryGreen} /></View>
                  <View style={styles.copy}>
                    <View style={styles.titleLine}>
                      <Text style={styles.itemTitle} numberOfLines={2}>{notification.title}</Text>
                      <Text style={[styles.readState, isRead && styles.readStateRead]}>{isRead ? "Read" : "Unread"}</Text>
                    </View>
                    <Text style={styles.body}>{notification.body}</Text>
                    <Text style={styles.time}>{timestamp(notification.createdAt)}</Text>
                  </View>
                  {openingId === notification.id ? <ActivityIndicator size="small" color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        ) : (
          <EmptyState icon={Bell} title="No notifications yet" message="Updates about your care will appear here." />
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: spacing.md, paddingTop: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  heading: { gap: spacing.xxs },
  title: { ...typography.title, color: colors.forestGreen },
  subtitle: { ...typography.caption, color: colors.secondaryText },
  loading: { minHeight: 180, alignItems: "center", justifyContent: "center", gap: spacing.sm },
  list: { gap: spacing.sm },
  item: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, padding: spacing.md, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  unreadItem: { borderColor: colors.primaryLight, backgroundColor: colors.ivory },
  pressed: { opacity: 0.75 },
  iconWrap: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.mint, alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, gap: spacing.xxs },
  titleLine: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  itemTitle: { ...typography.bodyBold, color: colors.forestGreen, flex: 1 },
  body: { ...typography.caption, color: colors.text },
  time: { ...typography.caption, color: colors.secondaryText, marginTop: spacing.xxs },
  readState: { fontSize: 10, lineHeight: 14, fontWeight: "700", color: colors.primaryGreen },
  readStateRead: { color: colors.secondaryText },
  errorNotice: { ...typography.caption, color: colors.danger },
});
