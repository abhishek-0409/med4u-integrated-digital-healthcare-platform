import React, { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { toApiError } from '../../services/api/errors';
import { reportService } from '../../services/report.service';
import { colors } from '../../theme/colors';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';
import { PickedFile } from '../../types/prescription';
import { filePicker, PickerError } from '../../utils/filePicker';

export function ReportUploader({ onUploaded }: { onUploaded: () => void }) {
  const [file, setFile] = useState<PickedFile | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const choose = async (pick: () => Promise<PickedFile | null>) => {
    setError(null);
    try { setFile(await pick()); } catch (e) { setError(e instanceof PickerError ? e.message : toApiError(e).message); }
  };
  const upload = async () => {
    if (!file || !name.trim() || !category.trim() || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError(null);
    try { await reportService.upload(file, name.trim(), category.trim()); setFile(null); setName(''); setCategory(''); onUploaded(); }
    catch (e) { setError(toApiError(e).message); }
    finally { setBusy(false); inFlight.current = false; }
  };
  return <View style={styles.wrap}>
    <Text style={styles.title}>Add a personal report</Text>
    <Text style={styles.hint}>Uploads are private and owner-scoped. The document is not interpreted or authenticated.</Text>
    <Input label="Document name" value={name} onChangeText={setName} maxLength={120} editable={!busy} placeholder="e.g. Blood work, Oct 2026" />
    <Input label="Category" value={category} onChangeText={setCategory} maxLength={80} editable={!busy} placeholder="e.g. Lab report" />
    <View style={styles.row}>
      <Button title="Choose photo" variant="secondary" size="sm" fullWidth={false} disabled={busy} onPress={() => void choose(filePicker.choosePhoto)} />
      <Button title="Choose PDF" variant="secondary" size="sm" fullWidth={false} disabled={busy} onPress={() => void choose(filePicker.choosePdf)} />
    </View>
    {file ? <Text style={styles.hint} numberOfLines={1}>Selected: {file.name}</Text> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <Button title="Upload private report" loading={busy} disabled={!file || !name.trim() || !category.trim()} onPress={() => void upload()} />
  </View>;
}
const styles = StyleSheet.create({ wrap: { gap: spacing.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: 16, backgroundColor: colors.card }, title: typography.title, hint: typography.caption, row: { flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }, error: { ...typography.body, color: colors.danger } });
