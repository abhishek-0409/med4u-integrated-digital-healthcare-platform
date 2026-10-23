import React, { useCallback, useEffect, useRef, useState } from "react";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Pencil, Plus, Trash2 } from "lucide-react-native";
import { ActionButton, Card, Page, TopBar } from "../components/ui";
import { Field, Notice } from "../components/formControls";
import { MedicineEditor } from "../components/MedicineEditor";
import { ErrorCard } from "../dashboard/DashboardView";
import { clinicDate } from "../dashboard/dashboardModel";
import { toDoctorApiError } from "../api/client";
import { draftCache } from "../prescription/draftCache";
import {
  describeDosage,
  emptyForm,
  emptyMedicine,
  formFromServer,
  medicineTitle,
  toDraftPayload,
  validateFollowUp,
  validateMedicine,
} from "../prescription/prescriptionModel";
import { prescriptionApi, retryIdempotent } from "../services/prescriptionApi";
import { AppointmentPrescriptionState, CatalogLabTest, MedicineForm, PrescriptionForm } from "../types/prescription";
import { DoctorStackParamList } from "../types/navigation";
import { colors, round, space, type } from "../theme/tokens";

type Props = NativeStackScreenProps<DoctorStackParamList, "PrescriptionEditor">;
type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; meta: AppointmentPrescriptionState };
type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };

const FOLLOW_UP_OFFSETS = [{ label: "1 week", days: 7 }, { label: "2 weeks", days: 14 }, { label: "1 month", days: 30 }];
const addDaysTo = (date: string, days: number) => new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);

export function PrescriptionEditorScreen({ navigation, route }: Props) {
  const { appointmentId } = route.params;
  const today = clinicDate(new Date());
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [form, setForm] = useState<PrescriptionForm>(emptyForm());
  const [editing, setEditing] = useState<MedicineForm | null>(null);
  const [labSearch, setLabSearch] = useState("");
  const [labResults, setLabResults] = useState<CatalogLabTest[]>([]);
  const [labSearchState, setLabSearchState] = useState<"idle" | "loading" | "error">("idle");
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [showProblems, setShowProblems] = useState(false);
  const alive = useRef(true);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revision = useRef<number | null>(null);
  const dirty = useRef(false);
  const latestForm = useRef(form);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const update = useCallback((next: PrescriptionForm) => {
    latestForm.current = next;
    dirty.current = true;
    setForm(next);
    const cached = draftCache.get(appointmentId);
    draftCache.set(appointmentId, { form: next, prescriptionId: cached?.prescriptionId ?? null, revision: revision.current });
  }, [appointmentId]);

  const open = useCallback(async () => {
    setLoad({ status: "loading" });
    try {
      const meta = await prescriptionApi.state(appointmentId);
      if (!alive.current) return;
      if (meta.issued && !meta.draft) {
        navigation.replace("PrescriptionDetail", { prescriptionId: meta.issued.id, appointmentId });
        return;
      }
      if (meta.draft) {
        const fromServer = formFromServer(meta.draft);
        latestForm.current = fromServer;
        setForm(fromServer);
        revision.current = meta.draft.revision;
        dirty.current = false;
        draftCache.set(appointmentId, { form: fromServer, prescriptionId: meta.draft.id, revision: meta.draft.revision });
      } else {
        const blank = emptyForm();
        latestForm.current = blank;
        setForm(blank);
        revision.current = null;
        dirty.current = false;
      }
      setLoad({ status: "ready", meta });
    } catch (error) {
      // A failed refresh must not discard what the doctor already typed.
      const cached = draftCache.get(appointmentId);
      if (alive.current && cached) { latestForm.current = cached.form; setForm(cached.form); revision.current = cached.revision; }
      if (alive.current) setLoad({ status: "error", message: toDoctorApiError(error).message });
    }
  }, [appointmentId, navigation]);
  useEffect(() => { void open(); }, [open]);

  const saveDraft = useCallback(async (value: PrescriptionForm = latestForm.current): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    setSave({ kind: "saving" });
    try {
      const payload = { ...toDraftPayload(value), baseRevision: revision.current };
      const saved = await retryIdempotent(() => prescriptionApi.saveDraft(appointmentId, payload));
      revision.current = saved.revision;
      draftCache.set(appointmentId, { form: value, prescriptionId: saved.id, revision: saved.revision });
      if (alive.current && latestForm.current === value) { dirty.current = false; setSave({ kind: "saved" }); }
      else if (alive.current) setSave({ kind: "idle" });
      return true;
    } catch (error) {
      if (alive.current) setSave({ kind: "error", message: `${toDoctorApiError(error).message} Your entries are kept on this screen. Try saving again.` });
      return false;
    } finally {
      busy.current = false;
    }
  }, [appointmentId]);

  useEffect(() => {
    if (load.status !== "ready" || !dirty.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (busy.current) { timer.current = setTimeout(() => void saveDraft(latestForm.current), 500); return; }
      void saveDraft(latestForm.current);
    }, 800);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [form, load.status, saveDraft]);

  useEffect(() => navigation.addListener("beforeRemove", (event) => {
    if (!dirty.current) return;
    event.preventDefault();
    Alert.alert("Unsaved changes", "This prescription draft has edits that are not saved yet.", [
      { text: "Stay", style: "cancel" },
      { text: "Leave", style: "destructive", onPress: () => navigation.dispatch(event.data.action) },
    ]);
  }), [navigation]);

  const review = async () => {
    setShowProblems(true);
    const followUp = validateFollowUp(form.followUpDate, today);
    const incomplete = form.medicines.some((m) => Object.keys(validateMedicine(m)).length > 0);
    if (!form.diagnosis.trim() || incomplete || followUp) return;
    if (await saveDraft()) navigation.navigate("PrescriptionReview", { appointmentId });
  };

  const removeMedicine = (m: MedicineForm) =>
    Alert.alert("Remove medicine?", `${m.name || "This medicine"} will be removed from the prescription.`, [
      { text: "Keep", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => update({ ...form, medicines: form.medicines.filter((x) => x.key !== m.key) }) },
    ]);

  const storeMedicine = (value: MedicineForm) => {
    const exists = form.medicines.some((m) => m.key === value.key);
    update({ ...form, medicines: exists ? form.medicines.map((m) => (m.key === value.key ? value : m)) : [...form.medicines, value] });
    setEditing(null);
  };

  const searchLabTests = async () => {
    const query = labSearch.trim();
    if (!query) return;
    setLabSearchState("loading");
    try {
      setLabResults(await prescriptionApi.searchLabTests(query));
      setLabSearchState("idle");
    } catch {
      setLabSearchState("error");
    }
  };

  const addLabTest = (test: CatalogLabTest) => {
    if (form.recommendedTests.some((item) => item.labTestId === test.id)) return;
    update({ ...form, recommendedTests: [...form.recommendedTests, { key: test.id, labTestId: test.id, name: test.name, category: test.category, isDemo: test.isDemo, clinicalInstructions: "" }] });
  };

  const followUpError = showProblems ? validateFollowUp(form.followUpDate, today) : null;

  return (
    <Page>
      <TopBar title="Prescription" back />
      {load.status === "loading" ? (
        <View style={styles.center} accessibilityState={{ busy: true }}><ActivityIndicator color={colors.green} /></View>
      ) : load.status === "error" && !draftCache.get(appointmentId) ? (
        <ErrorCard title="Couldn't open the prescription" message={load.message} onRetry={() => { void open(); }} />
      ) : (
        <>
          {load.status === "error" ? <Notice tone="warning">{`${load.message} Showing the draft saved on this device for this session.`}</Notice> : null}
          {load.status === "ready" && !load.meta.eligibility.canPrescribe ? <Notice tone="warning">{load.meta.eligibility.message ?? "A prescription cannot be written for this consultation."}</Notice> : null}
          {load.status === "ready" && load.meta.draft?.supersedesId ? (
            <Notice tone="info">{`Correcting ${load.meta.issued?.reference ?? "the issued prescription"}${load.meta.draft.amendmentReason ? `: ${load.meta.draft.amendmentReason}` : ""}. The original stays valid until you issue this correction.`}</Notice>
          ) : null}

          <Card>
            <Text style={styles.section}>Diagnosis / clinical assessment</Text>
            <Field label="Diagnosis" value={form.diagnosis} onChangeText={(v) => update({ ...form, diagnosis: v })} multiline maxLength={1000} error={showProblems && !form.diagnosis.trim() ? "Enter the diagnosis or clinical assessment." : undefined} />
          </Card>

          <Card>
            <Text style={styles.section}>Recommended lab tests</Text>
            <Text style={type.caption}>Choose tests from the Med4U catalog. Booking prices and collection availability come from the patient booking flow.</Text>
            <Field label="Search lab-test catalog" value={labSearch} onChangeText={setLabSearch} maxLength={100} />
            <ActionButton label={labSearchState === "loading" ? "Searching…" : "Search catalog"} secondary disabled={labSearchState === "loading" || !labSearch.trim()} onPress={() => { void searchLabTests(); }} />
            {labSearchState === "error" ? <Notice tone="error">Couldn't search the lab catalog. Try again.</Notice> : null}
            {labResults.map((test) => {
              const added = form.recommendedTests.some((item) => item.labTestId === test.id);
              return <View key={test.id} style={styles.testResult}>
                <View style={styles.medicineText}>
                  <Text style={type.label}>{test.name}</Text>
                  <Text style={type.caption}>{test.category}{test.isDemo ? " · Demo catalog item" : ""}</Text>
                </View>
                <ActionButton label={added ? "Added" : "Add"} secondary disabled={added} onPress={() => addLabTest(test)} />
              </View>;
            })}
            {form.recommendedTests.map((test) => <View key={test.key} style={styles.testCard}>
              <View style={styles.medicine}>
                <View style={styles.medicineText}><Text style={type.label}>{test.name}</Text><Text style={type.caption}>{test.category}{test.isDemo ? " · Demo catalog item" : ""}</Text></View>
                <Pressable onPress={() => update({ ...form, recommendedTests: form.recommendedTests.filter((x) => x.key !== test.key) })} accessibilityRole="button" accessibilityLabel={`Remove ${test.name}`} style={styles.iconButton}><Trash2 size={18} color={colors.danger} /></Pressable>
              </View>
              <Field label="Clinical instructions (optional)" value={test.clinicalInstructions} onChangeText={(value) => update({ ...form, recommendedTests: form.recommendedTests.map((x) => x.key === test.key ? { ...x, clinicalInstructions: value } : x) })} multiline maxLength={500} />
            </View>)}
            {form.recommendedTests.length === 0 ? <Text style={type.caption}>No tests recommended.</Text> : null}
          </Card>

          <Card>
            <Text style={styles.section}>Medicines</Text>
            {form.medicines.length === 0 ? <Text style={type.caption}>No medicines added yet. Nothing is prescribed by default.</Text> : null}
            {form.medicines.map((m) => {
              const incomplete = Object.keys(validateMedicine(m)).length > 0;
              return (
                <View key={m.key} style={styles.medicine}>
                  <View style={styles.medicineText}>
                    <Text style={type.label}>{m.name ? medicineTitle({ name: m.name, strength: m.strength, dosageForm: (m.dosageForm || "—") as never }) : "Unnamed medicine"}</Text>
                    {incomplete ? <Text style={styles.incomplete}>Incomplete: open it to fill in the missing details.</Text> : (
                      <Text style={type.caption}>{describeDosage({ dose: m.dose, route: m.route as never, frequency: m.frequency, durationValue: Number(m.durationValue), durationUnit: m.durationUnit, timing: m.timing, foodRelation: m.foodRelation })}</Text>
                    )}
                  </View>
                  <Pressable onPress={() => setEditing(m)} accessibilityRole="button" accessibilityLabel={`Edit ${m.name || "medicine"}`} style={styles.iconButton}><Pencil size={18} color={colors.green} /></Pressable>
                  <Pressable onPress={() => removeMedicine(m)} accessibilityRole="button" accessibilityLabel={`Remove ${m.name || "medicine"}`} style={styles.iconButton}><Trash2 size={18} color={colors.danger} /></Pressable>
                </View>
              );
            })}
            {showProblems && form.medicines.length === 0 ? <Text style={styles.error} accessibilityRole="alert">Add at least one medicine.</Text> : null}
            {showProblems && form.medicines.some((m) => Object.keys(validateMedicine(m)).length > 0) ? <Text style={styles.error} accessibilityRole="alert">Finish or remove the incomplete medicine entries.</Text> : null}
            <ActionButton label="Add medicine" secondary onPress={() => setEditing(emptyMedicine())} />
          </Card>

          <Card>
            <Field label="Additional instructions (optional)" value={form.additionalInstructions} onChangeText={(v) => update({ ...form, additionalInstructions: v })} multiline maxLength={1500} />
            <Field label="Warnings & patient-specific instructions (optional)" value={form.warnings} onChangeText={(v) => update({ ...form, warnings: v })} multiline maxLength={1000} hint="Allergies, interactions, symptoms that need urgent care." />
          </Card>

          <Card>
            <Field label="Follow-up date (optional)" value={form.followUpDate} onChangeText={(v) => update({ ...form, followUpDate: v })} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" maxLength={10} error={followUpError ?? undefined} />
            <View style={styles.chips}>
              {FOLLOW_UP_OFFSETS.map((o) => (
                <Pressable key={o.label} onPress={() => update({ ...form, followUpDate: addDaysTo(today, o.days) })} accessibilityRole="button" accessibilityLabel={`Follow up in ${o.label}`} style={styles.chip}><Text style={styles.chipText}>In {o.label}</Text></Pressable>
              ))}
              {form.followUpDate ? <Pressable onPress={() => update({ ...form, followUpDate: "" })} accessibilityRole="button" accessibilityLabel="Clear follow-up date" style={styles.chip}><Text style={styles.chipText}>Clear</Text></Pressable> : null}
            </View>
          </Card>

          {save.kind === "saving" ? <Text accessibilityLiveRegion="polite" style={styles.saveStatus}>Saving draft…</Text> : null}
          {save.kind === "saved" ? <Notice tone="success">Draft saved. It is not visible to the patient until you issue it.</Notice> : null}
          {save.kind === "error" ? <Notice tone="error">{save.message}</Notice> : null}

          <ActionButton label={save.kind === "saving" ? "Saving…" : save.kind === "error" ? "Retry saving draft" : "Save draft"} secondary disabled={save.kind === "saving" || (load.status === "ready" && !load.meta.eligibility.canPrescribe)} onPress={() => { void saveDraft(); }} />
          <ActionButton label="Review prescription" disabled={save.kind === "saving" || (load.status === "ready" && !load.meta.eligibility.canPrescribe)} onPress={() => { void review(); }} />
        </>
      )}

      <Modal visible={editing !== null} animationType="slide" onRequestClose={() => setEditing(null)}>
        <SafeAreaView style={styles.modal}>
          {editing ? <MedicineEditor key={editing.key} initial={editing} onSave={storeMedicine} onCancel={() => setEditing(null)} /> : null}
        </SafeAreaView>
      </Modal>
    </Page>
  );
}

const styles = StyleSheet.create({
  center: { paddingVertical: space.xxl, alignItems: "center" },
  section: { ...type.heading, color: colors.forest },
  medicine: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: space.xs, borderTopWidth: 1, borderTopColor: colors.border },
  medicineText: { flex: 1, gap: 2 },
  testResult: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: space.xs, borderTopWidth: 1, borderTopColor: colors.border },
  testCard: { gap: space.xs, paddingTop: space.xs, borderTopWidth: 1, borderTopColor: colors.border },
  incomplete: { fontSize: 13, color: colors.warning },
  iconButton: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  error: { fontSize: 13, color: colors.danger },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, justifyContent: "center", borderRadius: round.pill, backgroundColor: colors.sageLight },
  chipText: { fontSize: 14, fontWeight: "600", color: colors.forest },
  modal: { flex: 1, backgroundColor: colors.background },
  saveStatus: { color: colors.muted, paddingHorizontal: space.xs },
});
