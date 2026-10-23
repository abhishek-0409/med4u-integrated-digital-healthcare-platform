import React from "react";
import { Pressable, StyleProp, StyleSheet, TextInput, View, ViewStyle } from "react-native";
import { Search, X } from "lucide-react-native";
import { colors } from "../../theme/colors";
import { iconSizes, radius, sizes, spacing } from "../../theme/spacing";
import { typography } from "../../theme/typography";

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  accessibilityLabel?: string;
  onSubmit?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function SearchBar({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  onSubmit,
  style,
}: SearchBarProps) {
  return (
    <View style={[styles.bar, style]}>
      <Search size={iconSizes.md} color={colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder={placeholder}
        placeholderTextColor={colors.textSubtle}
        style={styles.input}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        accessibilityLabel={accessibilityLabel ?? placeholder}
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText("")}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          style={styles.clear}
        >
          <X size={iconSizes.md} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: sizes.searchBar,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.sm,
    gap: spacing.xs,
  },
  input: {
    flex: 1,
    ...typography.body,
    color: colors.text,
    paddingVertical: 0,
    minHeight: sizes.touchTarget,
  },
  clear: {
    minWidth: sizes.touchTarget - 8,
    minHeight: sizes.touchTarget - 8,
    alignItems: "center",
    justifyContent: "center",
  },
});
