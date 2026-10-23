import React, { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Activity, FileText } from "lucide-react-native";
import { Card } from "../../components/ui/Card";
import { ReportUploader } from "../../components/lab/ReportUploader";
import { SecureReportViewer } from "../../components/lab/SecureReportViewer";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { LoadingSkeleton } from "../../components/ui/LoadingSkeleton";
import { Screen } from "../../components/ui/Screen";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { toApiError } from "../../services/api/errors";
import { reportService } from "../../services/report.service";
import { colors } from "../../theme/colors";
import { iconSizes, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { MedicalReport } from "../../types/health-records";

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
};

export function ReportsScreen() {
  const [items, setItems] = useState<MedicalReport[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try { setItems(await reportService.list()); }
    catch (e) { setError(toApiError(e).message); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <Screen padded={false}>
      <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} />}>
        <View style={styles.intro}>
          <View style={styles.icon}><Activity size={iconSizes.lg} color={colors.primaryDark} /></View>
          <View style={styles.introText}>
            <Text style={styles.heading} accessibilityRole="header">Your reports</Text>
            <Text style={styles.subtitle}>Keep your medical documents together in one private place.</Text>
          </View>
        </View>

        <Card style={styles.uploadCard}>
          <Text style={styles.sectionTitle}>Add a report</Text>
          <ReportUploader onUploaded={() => void load(true)} />
        </Card>

        <Text style={styles.sectionTitle}>Report history</Text>
        {loading ? <LoadingSkeleton count={3} /> : error && !items.length ? (
          <ErrorState message={error} onRetry={() => void load()} />
        ) : !items.length ? (
          <EmptyState icon={FileText} title="No reports yet" message="Reports linked to your account will appear here." />
        ) : items.map((report) => (
          <Card key={report.id} style={styles.card}>
            <View style={styles.top}>
              <View style={styles.flex}>
                <Text style={styles.title}>{report.name}</Text>
                <Text style={styles.meta}>{report.category} · {formatDate(report.date)}</Text>
              </View>
              <StatusBadge label={report.status} tone="neutral" />
            </View>
            <Button
              title={openId === report.id ? "Close report" : "View report"}
              size="sm"
              fullWidth={false}
              variant="secondary"
              onPress={() => setOpenId((current) => current === report.id ? null : report.id)}
              accessibilityLabel={`${openId === report.id ? "Close" : "View"} ${report.name}`}
            />
            {openId === report.id ? <SecureReportViewer reportId={report.id} /> : null}
          </Card>
        ))}
        {error && items.length > 0 ? <Text style={styles.error} accessibilityRole="alert">{error}</Text> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  intro: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xs },
  introText: { flex: 1, gap: spacing.xxs },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.mint },
  heading: { ...typography.h2, color: colors.primaryDark },
  subtitle: { ...typography.body, color: colors.textMuted },
  sectionTitle: { ...typography.title, color: colors.primaryDark },
  uploadCard: { gap: spacing.sm },
  card: { gap: spacing.sm },
  top: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.sm },
  flex: { flex: 1, gap: spacing.xxs },
  title: { ...typography.bodyBold, color: colors.text },
  meta: { ...typography.caption, color: colors.textMuted },
  error: { ...typography.body, color: colors.danger },
});
