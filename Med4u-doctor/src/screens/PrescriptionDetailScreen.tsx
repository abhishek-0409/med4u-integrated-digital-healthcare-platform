import React, { useCallback, useEffect, useRef, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { ActionButton, Card, Page, TopBar } from "../components/ui";
import { Field, Notice } from "../components/formControls";
import { PrescriptionDocument } from "../components/PrescriptionDocument";
import { ErrorCard } from "../dashboard/DashboardView";
import { toDoctorApiError } from "../api/client";
import { draftCache } from "../prescription/draftCache";
import { formFromServer } from "../prescription/prescriptionModel";
import { prescriptionApi } from "../services/prescriptionApi";
import { DoctorPrescription } from "../types/prescription";
import { DoctorStackParamList } from "../types/navigation";
import { colors, space } from "../theme/tokens";

type Props = NativeStackScreenProps<DoctorStackParamList, "PrescriptionDetail">;
type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; rx: DoctorPrescription };
type Panel = "none" | "amend" | "cancel";

export function PrescriptionDetailScreen({ navigation, route }: Props) {
  const { prescriptionId, appointmentId, justIssued } = route.params;
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [panel, setPanel] = useState<Panel>("none");
  const [reason, setReason] = useState("");
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const open = useCallback(async () => {
    setLoad({ status: "loading" });
    try {
      const rx = await prescriptionApi.get(prescriptionId);
      if (alive.current) setLoad({ status: "ready", rx });
    } catch (error) {
      if (alive.current) setLoad({ status: "error", message: toDoctorApiError(error).message });
    }
  }, [prescriptionId]);
  useEffect(() => { void open(); }, [open]);

  const reasonValid = reason.trim().length >= 5;

  const submit = async (rx: DoctorPrescription) => {
    if (working || !reasonValid) return;
    setWorking(true);
    setActionError(null);
    try {
      if (panel === "amend") {
        const draft = await prescriptionApi.amend(rx.id, reason.trim());
        draftCache.set(appointmentId, { form: formFromServer(draft), prescriptionId: draft.id, revision: draft.revision });
        navigation.replace("PrescriptionEditor", { appointmentId });
      } else {
        const cancelled = await prescriptionApi.cancel(rx.id, reason.trim());
        setPanel("none");
        setReason("");
        if (alive.current) setLoad({ status: "ready", rx: cancelled });
      }
    } catch (error) {
      if (alive.current) setActionError(toDoctorApiError(error).message);
    } finally {
      if (alive.current) setWorking(false);
    }
  };

  return (
    <Page>
      <TopBar title="Prescription" back />
      {load.status === "loading" ? (
        <View style={styles.center} accessibilityState={{ busy: true }}><ActivityIndicator color={colors.green} /></View>
      ) : load.status === "error" ? (
        <ErrorCard title="Couldn't load the prescription" message={load.message} onRetry={() => { void open(); }} />
      ) : (
        <>
          {justIssued ? (
            <Notice tone="success">
              Prescription issued. It is now in {load.rx.patient.name}'s prescription list, and an in-app notification has been queued to direct them to it. Mobile push delivery is handled separately.
            </Notice>
          ) : null}
          <PrescriptionDocument
            doc={{
              reference: load.rx.reference,
              status: load.rx.status,
              doctor: load.rx.doctor,
              patientName: load.rx.patient.name,
              consultationDate: load.rx.consultation.date,
              issuedAt: load.rx.issuedAt,
              diagnosis: load.rx.diagnosis ?? "",
              medicines: load.rx.medicines,
              recommendedTests: load.rx.recommendedTests,
              additionalInstructions: load.rx.additionalInstructions,
              warnings: load.rx.warnings,
              followUpDate: load.rx.followUpDate,
              amendmentReason: load.rx.amendmentReason,
              cancellationReason: load.rx.cancellationReason,
            }}
          />
          {load.rx.status === "issued" ? (
            panel === "none" ? (
              <Card>
                <ActionButton label="Correct this prescription" secondary onPress={() => setPanel("amend")} />
                <ActionButton label="Cancel this prescription" secondary onPress={() => setPanel("cancel")} />
              </Card>
            ) : (
              <Card>
                <Notice tone="info">
                  {panel === "amend"
                    ? "The original stays valid and visible to the patient until you issue the correction. Your reason is recorded."
                    : "The patient will be told this prescription was cancelled. The record is kept. Your reason is recorded."}
                </Notice>
                <Field label={panel === "amend" ? "Reason for correction" : "Reason for cancelling"} value={reason} onChangeText={setReason} multiline maxLength={300} hint="At least 5 characters." />
                {actionError ? <Notice tone="error">{actionError}</Notice> : null}
                <ActionButton label={working ? "Working…" : panel === "amend" ? "Start correction" : "Cancel prescription"} disabled={working || !reasonValid} onPress={() => { void submit(load.rx); }} />
                <ActionButton label="Back" secondary disabled={working} onPress={() => { setPanel("none"); setReason(""); setActionError(null); }} />
              </Card>
            )
          ) : null}
          <ActionButton label="Back to appointments" secondary onPress={() => navigation.reset({ index: 0, routes: [{ name: "Appointments" }] })} />
        </>
      )}
    </Page>
  );
}

const styles = StyleSheet.create({ center: { paddingVertical: space.xxl, alignItems: "center" } });
