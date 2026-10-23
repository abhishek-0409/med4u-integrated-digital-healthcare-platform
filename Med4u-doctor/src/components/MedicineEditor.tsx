import React, { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ActionButton } from "./ui";
import { ChoiceChips, Field, MultiChips, Notice } from "./formControls";
import {
  applyCatalogProduct,
  FOOD_LABEL,
  FREQUENCY_PRESETS,
  MedicineErrors,
  TIMING_LABEL,
  titleCase,
  validateMedicine,
} from "../prescription/prescriptionModel";
import { prescriptionApi } from "../services/prescriptionApi";
import { colors, round, space, type } from "../theme/tokens";
import { CatalogProduct, DOSAGE_FORMS, DURATION_UNITS, FOOD_RELATIONS, MedicineForm, ROUTES, TIMINGS } from "../types/prescription";

/**
 * Edits one medicine. The name field searches the existing medicine catalog (suggestions only); picking one
 * prefills name/strength/form, and typing a different name makes the entry manual again. Nothing is defaulted:
 * dose, route, frequency, duration and quantity must be entered by the doctor.
 */
export function MedicineEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: MedicineForm;
  onSave: (value: MedicineForm) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<MedicineForm>(initial);
  const [errors, setErrors] = useState<MedicineErrors>({});
  const [suggestions, setSuggestions] = useState<CatalogProduct[]>([]);
  const [catalogError, setCatalogError] = useState(false);
  const [searched, setSearched] = useState(false);
  const typed = useRef(false);
  const set = <K extends keyof MedicineForm>(key: K, value: MedicineForm[K]) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    const query = form.name.trim();
    if (!typed.current || query.length < 2) {
      setSuggestions([]);
      setSearched(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      prescriptionApi
        .searchCatalog(query)
        .then((items) => { if (!cancelled) { setSuggestions(items); setCatalogError(false); setSearched(true); } })
        .catch(() => { if (!cancelled) { setSuggestions([]); setCatalogError(true); setSearched(true); } });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [form.name]);

  const onName = (name: string) => {
    typed.current = true;
    // Editing the name away from a catalog pick turns it back into a manual entry.
    setForm((f) => ({ ...f, name, ...(f.catalogMedicineId ? { catalogMedicineId: null, catalogIsSample: false } : {}) }));
  };
  const pick = (product: CatalogProduct) => {
    typed.current = false;
    setSuggestions([]);
    setSearched(false);
    setForm((f) => applyCatalogProduct(f, product));
  };
  const submit = () => {
    const found = validateMedicine(form);
    setErrors(found);
    if (Object.keys(found).length === 0) onSave(form);
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.title} accessibilityRole="header">Medicine</Text>

      <Field label="Medicine name" value={form.name} onChangeText={onName} error={errors.name} autoCapitalize="words" placeholder="Search the catalog or type a name" />
      {form.catalogMedicineId ? (
        <Notice tone="info">From the medicine catalog{form.catalogIsSample ? " (sample catalog entry)" : ""}. Check strength and form before prescribing.</Notice>
      ) : form.name.trim().length >= 2 ? (
        <Notice tone="warning">Entered manually. Make sure the spelling, strength and form are exactly what you intend.</Notice>
      ) : null}
      {suggestions.length > 0 ? (
        <View style={styles.suggestions} accessibilityLabel="Catalog suggestions">
          {suggestions.map((s) => (
            <Pressable key={s.id} onPress={() => pick(s)} accessibilityRole="button" accessibilityLabel={`Use ${s.name} ${s.strength ?? ""} ${s.form}`} style={styles.suggestion}>
              <Text style={type.label}>{s.name}{s.strength ? ` · ${s.strength}` : ""}</Text>
              <Text style={type.caption}>{s.genericName} · {s.form}{s.isDemo ? " · sample entry" : ""}</Text>
            </Pressable>
          ))}
        </View>
      ) : searched && !catalogError ? (
        <Text style={type.caption}>No catalog match. Continue typing to enter it manually.</Text>
      ) : null}
      {catalogError ? <Text style={type.caption}>The catalog could not be reached. You can still enter the medicine manually.</Text> : null}

      <Field label="Strength" value={form.strength} onChangeText={(v) => set("strength", v)} error={errors.strength} placeholder="e.g. 500 mg" />
      <ChoiceChips label="Dosage form" options={DOSAGE_FORMS} value={form.dosageForm} onChange={(v) => set("dosageForm", v)} format={titleCase} error={errors.dosageForm} />
      <Field label="Dose per administration" value={form.dose} onChangeText={(v) => set("dose", v)} error={errors.dose} placeholder="e.g. 1 tablet, 5 ml" />
      <ChoiceChips label="Route of administration" options={ROUTES} value={form.route} onChange={(v) => set("route", v)} format={titleCase} error={errors.route} />

      <ChoiceChips
        label="Frequency"
        options={FREQUENCY_PRESETS}
        value={(FREQUENCY_PRESETS as readonly string[]).includes(form.frequency) ? (form.frequency as (typeof FREQUENCY_PRESETS)[number]) : ""}
        onChange={(v) => set("frequency", v)}
      />
      <Field label="Frequency (or type your own)" value={form.frequency} onChangeText={(v) => set("frequency", v)} error={errors.frequency} placeholder="e.g. Every 6 hours" />

      <View style={styles.row}>
        <View style={styles.grow}><Field label="Duration" value={form.durationValue} onChangeText={(v) => set("durationValue", v.replace(/\D/g, ""))} error={errors.durationValue} keyboardType="number-pad" placeholder="e.g. 5" /></View>
      </View>
      <ChoiceChips label="Duration unit" options={DURATION_UNITS} value={form.durationUnit} onChange={(v) => set("durationUnit", v)} format={titleCase} />

      <View style={styles.row}>
        <View style={styles.grow}><Field label="Total quantity" value={form.quantity} onChangeText={(v) => set("quantity", v.replace(/\D/g, ""))} error={errors.quantity} keyboardType="number-pad" placeholder="e.g. 15" /></View>
        <View style={styles.grow}><Field label="Quantity unit (optional)" value={form.quantityUnit} onChangeText={(v) => set("quantityUnit", v)} placeholder="tablets, ml…" /></View>
      </View>

      <MultiChips label="Timing (optional)" options={TIMINGS} values={form.timing} onChange={(v) => set("timing", v)} format={(t) => TIMING_LABEL[t]} />
      <ChoiceChips label="Food" options={FOOD_RELATIONS} value={form.foodRelation} onChange={(v) => set("foodRelation", v)} format={(v) => FOOD_LABEL[v]} />
      <Field label="Instructions for this medicine (optional)" value={form.instructions} onChangeText={(v) => set("instructions", v)} multiline maxLength={500} />

      <ActionButton label="Save medicine" onPress={submit} />
      <ActionButton label="Cancel" secondary onPress={onCancel} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  title: { ...type.title, color: colors.forest },
  row: { flexDirection: "row", gap: space.sm },
  grow: { flex: 1 },
  suggestions: { borderWidth: 1, borderColor: colors.border, borderRadius: round.md, backgroundColor: colors.card, overflow: "hidden" },
  suggestion: { minHeight: 52, padding: space.sm, gap: 2, borderBottomWidth: 1, borderBottomColor: colors.border },
});
