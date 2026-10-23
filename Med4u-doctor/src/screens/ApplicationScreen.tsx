import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { CheckCircle2, Clock, FileText, Info, ShieldAlert } from "lucide-react-native";
import { toDoctorApiError } from "../api/client";
import { useAuth } from "../auth/authContext";
import { ApplicationForm } from "../components/ApplicationForm";
import { ActionButton, Card, Page } from "../components/ui";
import { applicationApi } from "../services/applicationApi";
import { ApplicationStatus, DoctorApplication } from "../types/application";
import { colors, round, space, type } from "../theme/tokens";

export const formatWhen = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

/** What the person should do next, per status. Pure so it can be tested without rendering. */
export function statusGuidance(application: Pick<DoctorApplication, "status" | "reviewOverdue" | "canResubmit">): string {
  switch (application.status) {
    case "PENDING_VERIFICATION":
      return application.reviewOverdue
        ? "This is taking longer than our 24-hour target. Your application has not been rejected; a reviewer will get to it."
        : "Your application is waiting for a reviewer.";
    case "UNDER_REVIEW":
      return application.reviewOverdue
        ? "A reviewer is checking your application, which is taking longer than our 24-hour target. It has not been rejected."
        : "A reviewer is checking your application now.";
    case "NEEDS_INFO":
      return "The reviewer needs something from you before they can continue.";
    case "REJECTED":
      return application.canResubmit
        ? "Your application was not approved. You can correct it and resubmit."
        : "Your application was not approved.";
    case "APPROVED":
      return "Your application was approved by a reviewer.";
  }
}

export function ApplicationScreen() {
  const { session, logout, retryRestore, working } = useAuth();
  const [application, setApplication] = useState<DoctorApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState<"submitted" | "resubmitted" | null>(null);
  const phone = session?.user.phone ?? "";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setApplication(await applicationApi.getMine());
    } catch (e) {
      setError(toDoctorApiError(e).message);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const done = (next: DoctorApplication, kind: "submitted" | "resubmitted") => {
    setApplication(next);
    setEditing(false);
    setJustSubmitted(kind);
  };

  return (
    <Page>
      <View style={styles.head}>
        <Text style={type.title}>Doctor application</Text>
        <Text onPress={() => void logout()} accessibilityRole="button" style={styles.signOut}>Sign out</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.forest} /><Text style={type.body}>Loading your application…</Text></View>
      ) : error ? (
        <Card style={styles.card}>
          <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>
          <ActionButton label="Try again" onPress={() => void load()} />
        </Card>
      ) : !application ? (
        <ApplicationForm mode="submit" phone={phone} onDone={(a) => done(a, "submitted")} />
      ) : editing ? (
        <>
          <ApplicationForm mode="resubmit" existing={application} phone={phone} onDone={(a) => done(a, "resubmitted")} />
          <ActionButton label="Cancel" secondary onPress={() => setEditing(false)} />
        </>
      ) : (
        <StatusView
          application={application}
          justSubmitted={justSubmitted}
          refreshing={loading}
          onRefresh={() => { setJustSubmitted(null); void load(); }}
          onEdit={() => setEditing(true)}
          onContinue={() => void retryRestore()}
          continuing={working}
        />
      )}
    </Page>
  );
}

function StatusView({ application, justSubmitted, onRefresh, onEdit, onContinue, continuing }: {
  application: DoctorApplication;
  justSubmitted: "submitted" | "resubmitted" | null;
  refreshing: boolean;
  onRefresh(): void;
  onEdit(): void;
  onContinue(): void;
  continuing: boolean;
}) {
  const tone = TONE[application.status];
  const Icon = tone.icon;
  return (
    <View style={styles.stack}>
      {justSubmitted ? (
        <Card style={{ ...styles.card, ...styles.confirm }}>
          <CheckCircle2 size={22} color={colors.forest} />
          <Text style={type.heading}>{justSubmitted === "submitted" ? "Application submitted" : "Application resubmitted"}</Text>
          <Text style={type.body}>
            We expect to review it within 24 hours, by {formatWhen(application.reviewDeadlineAt)}. That is our target, not a
            guarantee, and a review does not guarantee approval. Nothing is approved automatically.
          </Text>
        </Card>
      ) : null}

      <Card style={styles.card}>
        <View style={styles.statusRow} accessible accessibilityLabel={`Verification status: ${application.statusLabel}`}>
          <Icon size={22} color={tone.color} />
          <View style={[styles.badge, { backgroundColor: tone.bg }]}><Text style={[styles.badgeText, { color: tone.color }]}>{application.statusLabel}</Text></View>
        </View>
        <Text style={type.body}>{statusGuidance(application)}</Text>

        <View style={styles.facts}>
          <Fact label="Submitted" value={formatWhen(application.submittedAt)} />
          <Fact label="Expected review by" value={formatWhen(application.reviewDeadlineAt)} />
          <Fact label="Registration" value={`${application.registrationNumber} · ${application.registrationCouncil}`} />
        </View>
        <Text style={type.caption}>{application.reviewTargetNote}</Text>

        {application.applicantMessage ? (
          <View style={styles.message} accessibilityRole="alert">
            <Text style={styles.messageTitle}>{application.status === "REJECTED" ? "Reason" : "What we need"}</Text>
            <Text style={type.body}>{application.applicantMessage}</Text>
          </View>
        ) : null}

        {application.status === "APPROVED" ? (
          <>
            <Text style={type.body}>Your doctor account is being set up. Continue to open the Doctor App.</Text>
            <ActionButton label={continuing ? "Opening…" : "Continue to the Doctor App"} onPress={onContinue} disabled={continuing} />
          </>
        ) : null}
        {application.canResubmit ? <ActionButton label="Update and resubmit" onPress={onEdit} /> : null}
        <ActionButton label="Refresh status" secondary onPress={onRefresh} />
      </Card>

      <Card style={styles.card}>
        <Text style={type.heading}>Your documents</Text>
        {application.documents.length === 0 ? <Text style={type.caption}>No documents on file.</Text> : null}
        {application.documents.map((d) => (
          <View key={d.id} style={styles.doc}>
            <FileText size={16} color={colors.forest} />
            <Text style={[type.body, styles.docName]} numberOfLines={1}>
              {d.kind === "GRADUATION_CERTIFICATE" ? "Graduation certificate" : "Registration certificate"} · {d.fileName}
            </Text>
          </View>
        ))}
        <Text style={type.caption}>Uploaded documents are checked by a reviewer. Uploading does not mean they have been verified.</Text>
      </Card>

      <Card style={styles.card}>
        <Text style={type.caption}>
          Status updates are not sent as notifications yet, so please check back here or tap Refresh. Your email ({application.email}) is
          stored as contact information and has not been verified.
        </Text>
      </Card>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

const TONE: Record<ApplicationStatus, { color: string; bg: string; icon: typeof Clock }> = {
  PENDING_VERIFICATION: { color: colors.warning, bg: "#FBF1DC", icon: Clock },
  UNDER_REVIEW: { color: colors.forest, bg: colors.sageLight, icon: Info },
  NEEDS_INFO: { color: colors.warning, bg: "#FBF1DC", icon: Info },
  APPROVED: { color: colors.success, bg: colors.sageLight, icon: CheckCircle2 },
  REJECTED: { color: colors.danger, bg: "#FBE4E1", icon: ShieldAlert },
};

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.md },
  signOut: { ...type.label, color: colors.green },
  center: { alignItems: "center", gap: space.sm, paddingVertical: space.xxl },
  stack: { gap: space.md },
  card: { gap: space.sm },
  confirm: { backgroundColor: colors.sageLight },
  errorText: { fontSize: 14, color: colors.danger },
  statusRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  badge: { paddingHorizontal: space.sm, paddingVertical: 4, borderRadius: round.pill },
  badgeText: { fontSize: 14, fontWeight: "700" },
  facts: { gap: space.xs, marginVertical: space.xs },
  fact: { gap: 2 },
  factLabel: { ...type.caption },
  factValue: { ...type.body, fontWeight: "600" },
  message: { padding: space.sm, borderRadius: round.md, backgroundColor: "#FBF1DC", gap: 4 },
  messageTitle: { ...type.label },
  doc: { flexDirection: "row", alignItems: "center", gap: space.xs },
  docName: { flex: 1 },
});
