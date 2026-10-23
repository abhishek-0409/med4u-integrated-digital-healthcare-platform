import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, StyleSheet, Switch, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Plus, Trash2 } from "lucide-react-native";
import { ActionButton, Card, Page, TopBar } from "../components/ui";
import { DoctorStackParamList } from "../types/navigation";
import { colors, space, type } from "../theme/tokens";
import { doctorProfileApi } from "../services/appointmentApi";
import { toDoctorApiError } from "../api/client";
import { EditableSchedule, formatTime, toApiSchedule, toEditableSchedule, validateSchedule, WEEKDAYS } from "../availability/availabilityModel";

type Props = NativeStackScreenProps<DoctorStackParamList, "Availability">;
type PickerTarget = { day: keyof EditableSchedule; index: number; field: "start" | "end" };
const defaultNextInterval = (intervals: Array<{ start: string; end: string }>) => {
  const endMinute = intervals.reduce((latest, item) => Math.max(latest, item.end === "24:00" ? 1440 : Number(item.end.slice(0, 2)) * 60 + Number(item.end.slice(3))), 9 * 60);
  const start = Math.min(endMinute, 23 * 60);
  const end = Math.min(start + 60, 1440);
  const format = (value: number) => value === 1440 ? "24:00" : `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  return { start: format(start), end: format(end) };
};

export function AvailabilityScreen(_props: Props) {
  const [schedule, setSchedule] = useState<EditableSchedule | null>(null);
  const [saved, setSaved] = useState<EditableSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [pickerHour, setPickerHour] = useState(9);
  const [pickerMinute, setPickerMinute] = useState(0);
  const [pickerPeriod, setPickerPeriod] = useState<"AM" | "PM">("AM");

  const loadSchedule = useCallback(async () => {
    setLoading(true); setError(null); setSuccess(false);
    try {
      const identity = await doctorProfileApi.self();
      const restored = toEditableSchedule(identity.availabilitySchedule);
      setSchedule(restored); setSaved(restored);
    } catch (cause) {
      setError(toDoctorApiError(cause).message);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadSchedule(); }, [loadSchedule]);

  const changed = useMemo(() => JSON.stringify(schedule) !== JSON.stringify(saved), [schedule, saved]);
  const update = (fn: (current: EditableSchedule) => EditableSchedule) => {
    setSchedule((current) => current ? fn(current) : current);
    setSuccess(false);
  };
  const save = async () => {
    if (!schedule) return;
    const validation = validateSchedule(schedule);
    if (validation) { setError(validation); return; }
    setSaving(true); setError(null); setSuccess(false);
    try {
      const response = await doctorProfileApi.saveAvailability(toApiSchedule(schedule));
      const restored = toEditableSchedule(response.availabilitySchedule);
      setSchedule(restored); setSaved(restored); setSuccess(true);
    } catch (cause) { setError(toDoctorApiError(cause).message); }
    finally { setSaving(false); }
  };
  const openPicker = (target: PickerTarget, value: string) => {
    const [rawHour, minute] = (value === "24:00" ? "00:00" : value).split(":").map(Number);
    const hour24 = rawHour % 24;
    setPickerHour(hour24 % 12 || 12);
    setPickerMinute(minute);
    setPickerPeriod(hour24 < 12 ? "AM" : "PM");
    setPicker(target);
  };
  const commitPicker = () => {
    if (!picker) return;
    const hour24 = pickerPeriod === "AM" ? pickerHour % 12 : pickerHour % 12 + 12;
    let time = `${String(hour24).padStart(2, "0")}:${String(pickerMinute).padStart(2, "0")}`;
    if (picker.field === "end" && time === "00:00") time = "24:00";
    const target = picker;
    update((current) => {
      const day = current[target.day];
      const intervals = day.intervals.map((range, index) => index === target.index ? { ...range, [target.field]: time } : range);
      return { ...current, [target.day]: { ...day, intervals } };
    });
    setPicker(null);
  };

  return (
    <Page activeTab="Availability" refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void loadSchedule()} tintColor={colors.green} />}>
      <TopBar title="Availability" />
      <Text style={styles.subtitle}>Weekly clinic hours</Text>
      <Text style={styles.timezone}>Times use clinic local time · Asia/Kolkata</Text>
      {loading ? <View style={styles.state}><ActivityIndicator color={colors.green} /><Text style={styles.stateText}>Loading saved availability…</Text></View> : null}
      {!loading && error && !schedule ? <Card style={styles.stateCard}><Text style={styles.error}>{error}</Text><ActionButton label="Retry" onPress={() => void loadSchedule()} /></Card> : null}
      {!loading && schedule ? <>
        {!WEEKDAYS.some(({ key }) => schedule[key].enabled) ? <Text style={styles.empty}>No availability is published. Turn on a day and add your clinic hours.</Text> : null}
        <Card style={styles.weekCard}>
          {WEEKDAYS.map(({ key, label }, dayIndex) => {
            const day = schedule[key];
            return <View key={key} style={[styles.day, dayIndex === WEEKDAYS.length - 1 && styles.lastDay]}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayName}>{label}</Text>
                <Switch value={day.enabled} onValueChange={(enabled) => update((current) => ({
                  ...current, [key]: { ...current[key], enabled },
                }))} trackColor={{ false: colors.border, true: colors.sage }} thumbColor={day.enabled ? colors.green : "#fff"} accessibilityLabel={`${label} availability`} />
              </View>
              {day.enabled ? <>
                {day.intervals.map((interval, index) => <View key={`${key}-${index}`} style={styles.intervalRow}>
                  <Pressable style={styles.timeButton} accessibilityRole="button" accessibilityLabel={`${label}, interval ${index + 1} start, ${formatTime(interval.start)}`} onPress={() => openPicker({ day: key, index, field: "start" }, interval.start)}>
                    <Text style={styles.timeLabel}>START</Text><Text style={styles.timeValue}>{formatTime(interval.start)}</Text>
                  </Pressable>
                  <Text style={styles.to}>to</Text>
                  <Pressable style={styles.timeButton} accessibilityRole="button" accessibilityLabel={`${label}, interval ${index + 1} end, ${formatTime(interval.end, true)}`} onPress={() => openPicker({ day: key, index, field: "end" }, interval.end)}>
                    <Text style={styles.timeLabel}>END</Text><Text style={styles.timeValue}>{formatTime(interval.end, true)}</Text>
                  </Pressable>
                  <Pressable style={styles.remove} accessibilityRole="button" accessibilityLabel={`Remove ${label} interval ${index + 1}`} onPress={() => update((current) => ({
                    ...current, [key]: { ...current[key], intervals: current[key].intervals.filter((_, itemIndex) => itemIndex !== index) },
                  }))}><Trash2 size={17} color={colors.danger} /></Pressable>
                </View>)}
                <Pressable style={styles.addButton} accessibilityRole="button" onPress={() => update((current) => ({
                  ...current, [key]: { ...current[key], intervals: [...current[key].intervals, defaultNextInterval(current[key].intervals)] },
                }))}>
                  <Plus size={16} color={colors.green} /><Text style={styles.addText}>Add interval</Text>
                </Pressable>
              </> : <Text style={styles.offText}>Not available</Text>}
            </View>;
          })}
        </Card>
        {changed ? <Text style={styles.unsaved}>Unsaved changes</Text> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {success ? <Text accessibilityRole="alert" style={styles.success}>Availability saved and published.</Text> : null}
        <ActionButton label={saving ? "Saving…" : "Save & publish availability"} onPress={() => void save()} disabled={!changed || saving} />
      </> : null}
      {picker ? <View style={styles.pickerPanel}>
        <Text style={styles.pickerTitle}>{picker.field === "start" ? "Choose start time" : "Choose end time"}</Text>
        <Text style={styles.pickerHint}>12:00 AM = midnight · 12:00 PM = noon</Text>
        <View style={styles.pickerControls}>
          <View style={styles.pickerColumn}>
            <Text style={styles.pickerField}>HOUR</Text>
            <View style={styles.stepper}>
              <Pressable accessibilityRole="button" accessibilityLabel="Decrease hour" style={styles.stepButton} onPress={() => setPickerHour((hour) => hour === 1 ? 12 : hour - 1)}><Text style={styles.stepText}>−</Text></Pressable>
              <Text accessibilityLabel={`Hour ${pickerHour}`} style={styles.pickerNumber}>{String(pickerHour).padStart(2, "0")}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Increase hour" style={styles.stepButton} onPress={() => setPickerHour((hour) => hour === 12 ? 1 : hour + 1)}><Text style={styles.stepText}>+</Text></Pressable>
            </View>
          </View>
          <View style={styles.pickerColumn}>
            <Text style={styles.pickerField}>MINUTE</Text>
            <View style={styles.stepper}>
              <Pressable accessibilityRole="button" accessibilityLabel="Decrease minute" style={styles.stepButton} onPress={() => setPickerMinute((minute) => minute === 0 ? 55 : minute - 5)}><Text style={styles.stepText}>−</Text></Pressable>
              <Text accessibilityLabel={`Minute ${pickerMinute}`} style={styles.pickerNumber}>{String(pickerMinute).padStart(2, "0")}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Increase minute" style={styles.stepButton} onPress={() => setPickerMinute((minute) => minute === 55 ? 0 : minute + 5)}><Text style={styles.stepText}>+</Text></Pressable>
            </View>
          </View>
          <View style={styles.pickerColumn}>
            <Text style={styles.pickerField}>PERIOD</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Period ${pickerPeriod}. Tap to switch`} style={styles.periodButton} onPress={() => setPickerPeriod((period) => period === "AM" ? "PM" : "AM")}><Text style={styles.periodText}>{pickerPeriod}</Text></Pressable>
          </View>
        </View>
        <View style={styles.pickerActions}>
          <Pressable accessibilityRole="button" style={styles.cancelButton} onPress={() => setPicker(null)}><Text style={styles.cancelText}>Cancel</Text></Pressable>
          <Pressable accessibilityRole="button" style={styles.useButton} onPress={commitPicker}><Text style={styles.useText}>Use time</Text></Pressable>
        </View>
      </View> : null}
    </Page>
  );
}

const styles = StyleSheet.create({
  subtitle: { ...type.heading, marginTop: space.xs },
  timezone: { ...type.caption, marginTop: 2, marginBottom: space.md },
  weekCard: { paddingTop: 2, paddingBottom: 2 },
  day: { paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  lastDay: { borderBottomWidth: 0 },
  dayHeader: { minHeight: 38, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  dayName: { ...type.label },
  intervalRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
  timeButton: { flex: 1, minHeight: 48, justifyContent: "center", paddingHorizontal: 9, borderRadius: 9, backgroundColor: colors.cream },
  timeLabel: { color: colors.muted, fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  timeValue: { color: colors.forest, fontSize: 12, fontWeight: "700", marginTop: 2 },
  to: { ...type.caption },
  remove: { width: 32, height: 42, alignItems: "center", justifyContent: "center" },
  addButton: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 5, marginTop: 8, minHeight: 32 },
  addText: { color: colors.green, fontSize: 12, fontWeight: "700" },
  offText: { ...type.caption, paddingVertical: 4 },
  unsaved: { ...type.caption, color: colors.warning, marginTop: 10 },
  error: { color: colors.danger, fontSize: 13, lineHeight: 19, marginVertical: 8 },
  success: { color: colors.success, fontSize: 13, fontWeight: "600", marginVertical: 8 },
  state: { alignItems: "center", gap: 8, padding: 30 },
  stateText: { ...type.caption },
  stateCard: { gap: 12 },
  empty: { ...type.caption, marginBottom: 10, padding: 12, borderRadius: 10, backgroundColor: colors.cream },
  pickerPanel: { marginBottom: 14, padding: 12, borderRadius: 12, backgroundColor: colors.sageLight, alignItems: "center" },
  pickerTitle: { ...type.label, fontSize: 13, textAlign: "center" },
  pickerHint: { ...type.caption, fontSize: 11, marginTop: 2, textAlign: "center" },
  pickerControls: { flexDirection: "row", justifyContent: "space-around", width: "100%", marginTop: 12 },
  pickerColumn: { alignItems: "center", gap: 4 },
  pickerField: { color: colors.muted, fontSize: 9, fontWeight: "700", letterSpacing: 0.6 },
  stepper: { alignItems: "center", gap: 3 },
  stepButton: { minWidth: 42, minHeight: 30, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.card },
  stepText: { color: colors.green, fontSize: 18, fontWeight: "700" },
  pickerNumber: { color: colors.forest, fontSize: 18, fontWeight: "700", minWidth: 40, textAlign: "center" },
  periodButton: { minWidth: 54, minHeight: 38, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: colors.card },
  periodText: { color: colors.forest, fontWeight: "700" },
  pickerActions: { flexDirection: "row", alignSelf: "stretch", justifyContent: "flex-end", gap: 8, marginTop: 10 },
  cancelButton: { minHeight: 38, justifyContent: "center", paddingHorizontal: 12 },
  cancelText: { color: colors.muted, fontWeight: "600" },
  useButton: { minHeight: 38, justifyContent: "center", paddingHorizontal: 14, borderRadius: 9, backgroundColor: colors.green },
  useText: { color: "#fff", fontWeight: "700" },
});
