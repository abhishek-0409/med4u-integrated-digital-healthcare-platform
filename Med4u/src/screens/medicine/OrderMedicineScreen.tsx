import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pill, Receipt, ShoppingCart } from "lucide-react-native";
import { MedicineCard } from "../../components/medicine/MedicineCard";
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
import { medicineService } from "../../services/medicine.service";
import { useUserStore } from "../../store/userStore";
import { colors } from "../../theme/colors";
import { iconSizes, radius, shadows, sizes, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";
import { MedicineSort } from "../../types/medicine";
import { MainStackParamList } from "../../types/navigation";

type Props = NativeStackScreenProps<MainStackParamList, "OrderMedicine">;

const PAGE_SIZE = 20;
const ALL = "All";

const SORTS: Array<{ value: MedicineSort; label: string }> = [
  { value: "name", label: "A–Z" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

export function OrderMedicineScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState(route.params?.search ?? "");
  const [category, setCategory] = useState<string | undefined>(route.params?.category);
  const [sortBy, setSortBy] = useState<MedicineSort>("name");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [rxFilter, setRxFilter] = useState<boolean | undefined>(undefined);
  const debouncedSearch = useDebouncedValue(search.trim(), 400);

  // Follow navigation params when the screen is re-opened with a different filter.
  useEffect(() => {
    setCategory(route.params?.category);
    setSearch(route.params?.search ?? "");
  }, [route.params?.category, route.params?.search]);

  const cart = useUserStore((state) => state.cart);
  const addToCart = useUserStore((state) => state.addToCart);
  const cartCount = useMemo(() => cart.reduce((n, item) => n + item.quantity, 0), [cart]);
  const quantityInCart = useCallback(
    (id: string) => cart.find((item) => item.id === id)?.quantity ?? 0,
    [cart],
  );

  const { data: categories = [] } = useAsyncData(() => medicineService.categories(), []);

  const { items, meta, loading, loadingMore, error, reload, loadMore } = usePaginatedData(
    (page) =>
      medicineService.list({
        search: debouncedSearch || undefined,
        category,
        sortBy,
        inStock: inStockOnly || undefined,
        requiresPrescription: rxFilter,
        page,
        limit: PAGE_SIZE,
      }),
    [debouncedSearch, category, sortBy, inStockOnly, rxFilter],
  );

  const hasFilters = Boolean(category || debouncedSearch || inStockOnly || rxFilter !== undefined);
  const hasDemoProducts = items.some((product) => product.isDemo);
  const clearFilters = () => {
    setSearch("");
    setCategory(undefined);
    setInStockOnly(false);
    setRxFilter(undefined);
  };

  const header = (
    <View style={styles.header}>
      <SearchBar
        value={search}
        onChangeText={setSearch}
        placeholder="Search medicines, brands or generics"
        accessibilityLabel="Search medicines"
      />
      <FlatList
        data={[ALL, ...categories.map((c) => c.category)]}
        horizontal
        keyExtractor={(item) => item}
        showsHorizontalScrollIndicator={false}
        style={styles.chipsWrap}
        contentContainerStyle={styles.chips}
        renderItem={({ item }) => (
          <CategoryChip
            label={item}
            selected={item === ALL ? !category : category === item}
            onPress={() => setCategory(item === ALL ? undefined : item)}
          />
        )}
      />
      <FlatList
        data={SORTS}
        horizontal
        keyExtractor={(item) => item.value}
        showsHorizontalScrollIndicator={false}
        style={styles.chipsWrap}
        contentContainerStyle={styles.chips}
        ListHeaderComponent={
          <View style={styles.chips}>
            <CategoryChip label="In stock only" selected={inStockOnly} onPress={() => setInStockOnly((v) => !v)} />
            <CategoryChip label="Prescription required" selected={rxFilter === true} onPress={() => setRxFilter((v) => (v === true ? undefined : true))} />
            <CategoryChip label="No prescription" selected={rxFilter === false} onPress={() => setRxFilter((v) => (v === false ? undefined : false))} />
          </View>
        }
        renderItem={({ item }) => (
          <CategoryChip label={item.label} selected={sortBy === item.value} onPress={() => setSortBy(item.value)} />
        )}
      />
      <View style={styles.countRow}>
        <Text style={styles.count} accessibilityLiveRegion="polite">
          {meta ? `${meta.total} ${meta.total === 1 ? "product" : "products"}` : " "}
        </Text>
        <Pressable
          onPress={() => navigation.navigate("Orders")}
          style={styles.ordersLink}
          accessibilityRole="link"
          accessibilityLabel="My orders"
        >
          <Receipt size={iconSizes.sm} color={colors.primaryDark} />
          <Text style={styles.ordersLinkText}>My orders</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <Screen padded={false}>
      <View style={styles.body}>
        {
          // One list stays mounted through loading and errors so the search box keeps focus while typing.
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.list, cartCount > 0 && styles.listWithBar]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            refreshing={loading && items.length > 0}
            onRefresh={reload}
            initialNumToRender={8}
            windowSize={7}
            removeClippedSubviews
            ListHeaderComponent={
              <View>
                {hasDemoProducts ? (
                  <InfoBanner
                    tone="info"
                    title="Demo products"
                    message="Some products shown are demonstration items with estimated prices. They are not available for purchase or delivery."
                  />
                ) : null}
                {header}
              </View>
            }
            ListEmptyComponent={
              loading ? (
                <LoadingSkeleton variant="medicine" count={5} />
              ) : error ? (
                <ErrorState message={error} onRetry={reload} />
              ) : (
                <EmptyState
                  icon={Pill}
                  title="No medicines found"
                  message={hasFilters ? "Try a different search or clear the filters." : "The catalog is empty right now."}
                  actionLabel={hasFilters ? "Clear filters" : undefined}
                  onAction={hasFilters ? clearFilters : undefined}
                />
              )
            }
            ListFooterComponent={
              loadingMore ? (
                <ActivityIndicator style={styles.footer} color={colors.primary} />
              ) : error ? (
                <Pressable onPress={reload} style={styles.footer} accessibilityRole="button">
                  <Text style={styles.retryText}>{error} Tap to retry.</Text>
                </Pressable>
              ) : null
            }
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            renderItem={({ item }) => (
              <MedicineCard
                product={item}
                inCart={quantityInCart(item.id)}
                onPress={() => navigation.navigate("MedicineDetail", { medicineId: item.id })}
                onAdd={() => addToCart(item)}
              />
            )}
          />
        }

        {cartCount > 0 ? (
          <Pressable
            style={({ pressed }) => [
              styles.cartBar,
              { bottom: Math.max(insets.bottom, spacing.lg) },
              pressed && styles.cartBarPressed,
            ]}
            onPress={() => navigation.navigate("Cart")}
            accessibilityRole="button"
            accessibilityLabel={`View cart, ${cartCount} ${cartCount === 1 ? "item" : "items"}`}
          >
            <ShoppingCart size={iconSizes.md} color={colors.white} />
            <Text style={styles.cartBarText}>
              View cart · {cartCount} {cartCount === 1 ? "item" : "items"}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
  header: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  chipsWrap: {
    flexGrow: 0,
  },
  chips: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  count: {
    ...typography.caption,
    color: colors.textSubtle,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl + sizes.buttonMd,
  },
  listWithBar: {
    paddingBottom: spacing.xxl * 2 + sizes.buttonMd,
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
  cartBar: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    minHeight: sizes.buttonMd + 4,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    ...shadows.raised,
  },
  cartBarPressed: {
    opacity: 0.9,
  },
  cartBarText: {
    ...typography.bodyBold,
    color: colors.white,
    flex: 1,
  },
  countRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ordersLink: {
    minHeight: sizes.touchTarget - 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ordersLinkText: {
    ...typography.bodyBold,
    color: colors.primaryDark,
  },
});
