import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Stethoscope } from "lucide-react-native";
import { DoctorCard } from "../../components/doctor/DoctorCard";
import { CategoryChip } from "../../components/ui/CategoryChip";
import { EmptyState } from "../../components/ui/EmptyState";
import { ErrorState } from "../../components/ui/ErrorState";
import { InfoBanner } from "../../components/ui/InfoBanner";
import { LoadingSkeleton } from "../../components/ui/LoadingSkeleton";
import { Screen } from "../../components/ui/Screen";
import { SearchBar } from "../../components/ui/SearchBar";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { usePaginatedData } from "../../hooks/usePaginatedData";
import { doctorService } from "../../services/doctor.service";
import { colors } from "../../theme/colors";
import { spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { DoctorListParams } from "../../types/doctor";
import { ConsultationMode } from "../../types/doctor";
import { MainStackParamList } from "../../types/navigation";

type Props = NativeStackScreenProps<MainStackParamList, "DoctorList">;
type Sort = NonNullable<DoctorListParams["sortBy"]>;

const PAGE_SIZE = 10;
const ALL = "All";

// Rating is deliberately not offered as a sort: until real reviews exist every rating is 0.
const SORTS: Array<{ value: Sort; label: string }> = [
  { value: "experience", label: "Most experienced" },
  { value: "fee", label: "Fee: low to high" },
];
const MODES: Array<{ label: string; value?: ConsultationMode }> = [
  { label: "Any mode" },
  { label: "Online only", value: "ONLINE" },
  { label: "In person only", value: "OFFLINE" },
  { label: "Online & in person", value: "BOTH" },
];
const FEE_LIMITS: Array<{ label: string; value?: number }> = [
  { label: "Any fee" },
  { label: "Up to ₹500", value: 500 },
  { label: "Up to ₹1,000", value: 1000 },
];

export function DoctorListScreen({ navigation, route }: Props) {
  const [search, setSearch] = useState(route.params?.search ?? "");
  const [specialization, setSpecialization] = useState<string | undefined>(route.params?.specialization);
  const [sortBy, setSortBy] = useState<Sort>("experience");
  const [consultationMode, setConsultationMode] = useState<ConsultationMode | undefined>();
  const [maxFee, setMaxFee] = useState<number | undefined>();
  const debouncedSearch = useDebouncedValue(search.trim(), 400);

  // Follow navigation params when the screen is re-opened with a different filter.
  useEffect(() => {
    setSpecialization(route.params?.specialization);
    setSearch(route.params?.search ?? "");
  }, [route.params?.specialization, route.params?.search]);

  const { data: specializations = [] } = useAsyncData(() => doctorService.getSpecializations(), []);

  // Filtering and paging happen on the server; a new filter restarts from page 1 and any
  // response for an older filter is discarded.
  const { items: doctors, meta, loading, loadingMore, error, reload, loadMore } = usePaginatedData(
    (page) =>
      doctorService.list({
        specialization,
        search: debouncedSearch || undefined,
        consultationMode,
        maxFee,
        sortBy,
        page,
        limit: PAGE_SIZE,
      }),
    [specialization, debouncedSearch, consultationMode, maxFee, sortBy],
  );

  const hasFilters = Boolean(specialization || debouncedSearch || consultationMode || maxFee);
  const clearFilters = () => {
    setSearch("");
    setSpecialization(undefined);
    setConsultationMode(undefined);
    setMaxFee(undefined);
  };
  const hasDemo = doctors.some((d) => d.isDemo);

  return (
    <Screen padded={false}>
      <FlatList
        data={doctors}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshing={loading && doctors.length > 0}
        onRefresh={reload}
        initialNumToRender={6}
        windowSize={7}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={
          <View style={styles.header}>
            {hasDemo ? (
              <InfoBanner
                title="Demo doctors"
                message="These are fictional demonstration profiles, not real or verified doctors."
              />
            ) : null}
            <SearchBar
              value={search}
              onChangeText={setSearch}
              placeholder="Search by doctor, specialty or city"
              accessibilityLabel="Search doctors"
            />
            <Text style={styles.filterHeading}>Specialty</Text>
            <FlatList
              data={[ALL, ...specializations]}
              horizontal
              keyExtractor={(item) => item}
              showsHorizontalScrollIndicator={false}
              style={styles.chipsWrap}
              contentContainerStyle={styles.chips}
              renderItem={({ item }) => (
                <CategoryChip
                  label={item}
                  selected={item === ALL ? !specialization : specialization === item}
                  onPress={() => setSpecialization(item === ALL ? undefined : item)}
                />
              )}
            />
            <Text style={styles.filterHeading}>Consultation</Text>
            <FlatList
              data={MODES}
              horizontal
              keyExtractor={(item) => item.label}
              showsHorizontalScrollIndicator={false}
              style={styles.chipsWrap}
              contentContainerStyle={styles.chips}
              renderItem={({ item }) => (
                <CategoryChip
                  label={item.label}
                  selected={consultationMode === item.value}
                  onPress={() => setConsultationMode(item.value)}
                />
              )}
            />
            <Text style={styles.filterHeading}>Consultation fee</Text>
            <FlatList
              data={FEE_LIMITS}
              horizontal
              keyExtractor={(item) => item.label}
              showsHorizontalScrollIndicator={false}
              style={styles.chipsWrap}
              contentContainerStyle={styles.chips}
              renderItem={({ item }) => (
                <CategoryChip
                  label={item.label}
                  selected={maxFee === item.value}
                  onPress={() => setMaxFee(item.value)}
                />
              )}
            />
            <Text style={styles.filterHeading}>Sort by</Text>
            <FlatList
              data={SORTS}
              horizontal
              keyExtractor={(item) => item.value}
              showsHorizontalScrollIndicator={false}
              style={styles.chipsWrap}
              contentContainerStyle={styles.chips}
              renderItem={({ item }) => (
                <CategoryChip label={item.label} selected={sortBy === item.value} onPress={() => setSortBy(item.value)} />
              )}
            />
            {meta ? (
              <Text style={styles.count} accessibilityLiveRegion="polite">
                {meta.total} {meta.total === 1 ? "doctor" : "doctors"}
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <LoadingSkeleton variant="doctor" count={5} />
          ) : error ? (
            <ErrorState message={error} onRetry={reload} />
          ) : (
            <EmptyState
              icon={Stethoscope}
              title="No doctors found"
              message={hasFilters ? "Try a different search or clear the filters." : "No doctors are available yet."}
              actionLabel={hasFilters ? "Clear filters" : undefined}
              onAction={hasFilters ? clearFilters : undefined}
            />
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={styles.footer} color={colors.primary} />
          ) : error && doctors.length > 0 ? (
            <Pressable onPress={reload} style={styles.footer} accessibilityRole="button">
              <Text style={styles.retryText}>{error} Tap to retry.</Text>
            </Pressable>
          ) : null
        }
        renderItem={({ item }) => (
          <DoctorCard
            doctor={item}
            onPress={() => navigation.navigate("DoctorDetail", { doctorId: item.id })}
            onBookNow={() => navigation.navigate("BookDoctor", { doctorId: item.id })}
          />
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    gap: spacing.xs,
    paddingBottom: spacing.md,
  },
  filterHeading: {
    ...typography.bodyBold,
    marginTop: spacing.xs,
  },
  chipsWrap: {
    flexGrow: 0,
  },
  chips: {
    gap: spacing.xs,
  },
  count: {
    ...typography.caption,
    color: colors.textSubtle,
  },
  separator: {
    height: spacing.sm,
  },
  footer: {
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  retryText: {
    ...typography.caption,
    color: colors.danger,
    textAlign: "center",
  },
});
