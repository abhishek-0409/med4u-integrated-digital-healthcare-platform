import React, { useCallback, useEffect, useRef, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";
import { ActionButton, Card, Page, TopBar } from "../components/ui";
import { Notice } from "../components/formControls";
import { PrescriptionDocument } from "../components/PrescriptionDocument";
import { ErrorCard } from "../dashboard/DashboardView";
import { toDoctorApiError } from "../api/client";
import { draftCache } from "../prescription/draftCache";
import { prescriptionApi, retryIdempotent } from "../services/prescriptionApi";
import { DoctorPrescription } from "../types/prescription";
import { DoctorStackParamList } from "../types/navigation";
import { colors, space } from "../theme/tokens";

type Props = NativeStackScreenProps<DoctorStackParamList, "PrescriptionReview">;
type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; draft: DoctorPrescription };

/**
 * Final read-through of exactly what the server holds as the draft (not the local form), then a confirmed issue.
 * Issuing is bound to the reviewed revision and is idempotent, so repeated taps or a retry after a lost response
 * can never create a second prescription.
 */
export function PrescriptionReviewScreen({ navigation, route }: Props) {
  const { appointmentId } = route.params;
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [issuing, setIssuing] = useState(false);
  const [issueError, setIssueError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const open = useCallback(async () => {
    setLoad({ status: "loading" });
    try {
      const state = await prescriptionApi.state(appointmentId);
      if (!alive.current) return;
      if (!state.draft) {
        if (state.issued) navigation.replace("PrescriptionDetail", { prescriptionId: state.issued.id, appointmentId });
        else setLoad({ status: "error", message: "There is no saved draft to review. Go back and save your prescription first." });
        return;
      }
      setLoad({ status: "ready", draft: state.draft });
    } catch (error) {
      if (alive.current) setLoad({ status: "error", message: toDoctorApiError(error).message });
    }
  }, [appointmentId, navigation]);
  useEffect(() => { void open(); }, [open]);

  const issue = (draft: DoctorPrescription) => {
    if (inFlight.current) return; // double-tap guard; the server is idempotent as well
    inFlight.current = true;
    setIssuing(true);
    setIssueError(null);
    retryIdempotent(() => prescriptionApi.issue(draft.id, draft.revision))
      .then((result) => {
        draftCache.clear(appointmentId);
        navigation.replace("PrescriptionDetail", { prescriptionId: result.prescription.id, appointmentId, justIssued: true });
      })
      .catch((error) => {
        if (alive.current) setIssueError(toDoctorApiError(error).message);
      })
      .finally(() => {
        inFlight.current = false;
        if (alive.current) setIssuing(false);
      });
  };

  const confirm = (draft: DoctorPrescription) =>
    Alert.alert(
      "Issue this prescription?",
      `${draft.patient.name} will be able to see it in their Med4U app. An issued prescription cannot be edited; corrections are recorded as an amendment.`,
      [{ text: "Not yet", style: "cancel" }, { text: "Issue prescription", onPress: () => issue(draft) }],
    );

  return (
    <Page>
      <TopBar title="Review prescription" back />
      {load.status === "loading" ? (
        <View style={styles.center} accessibilityState={{ busy: true }}><ActivityIndicator color={colors.green} /></View>
      ) : load.status === "error" ? (
        <ErrorCard title="Couldn't load the draft" message={load.message} onRetry={() => { void open(); }} />
      ) : (
        <>
          <Notice tone="warning">Check every dose, route and duration. This is exactly what the patient will receive.</Notice>
          <PrescriptionDocument
            doc={{
              reference: null,
              status: "preview",
              doctor: load.draft.doctor,
              patientName: load.draft.patient.name,
              consultationDate: load.draft.consultation.date,
              issuedAt: null,
              diagnosis: load.draft.diagnosis ?? "",
              medicines: load.draft.medicines,
              recommendedTests: load.draft.recommendedTests,
              additionalInstructions: load.draft.additionalInstructions,
              warnings: load.draft.warnings,
              followUpDate: load.draft.followUpDate,
              amendmentReason: load.draft.amendmentReason,
            }}
          />
          {issueError ? <Notice tone="error">{`${issueError} Nothing was lost; the draft is saved. You can safely try again.`}</Notice> : null}
          <Card>
            <ActionButton label={issuing ? "Issuing…" : issueError ? "Try issuing again" : "Issue prescription"} disabled={issuing} onPress={() => confirm(load.draft)} />
            <ActionButton label="Edit prescription" secondary disabled={issuing} onPress={() => navigation.goBack()} />
          </Card>
        </>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({ center: { paddingVertical: space.xxl, alignItems: "center" } });
