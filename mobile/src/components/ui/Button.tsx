import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold';
type Size = 'sm' | 'md' | 'lg';

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  style,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  style?: ViewStyle;
}) {
  const v = variants[variant];
  const s = sizes[size];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: v.bg, borderColor: v.border, paddingVertical: s.py, paddingHorizontal: s.px },
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && { opacity: 0.85 },
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={styles.content}>
          {leftIcon}
          <Text style={[styles.label, { color: v.fg, fontSize: s.fs }]} numberOfLines={1}>
            {label}
          </Text>
          {rightIcon}
        </View>
      )}
    </Pressable>
  );
}

const variants: Record<Variant, { bg: string; fg: string; border: string }> = {
  primary:   { bg: colors.primary,     fg: colors.textInverse, border: colors.primary },
  secondary: { bg: colors.primarySoft, fg: colors.primaryDark, border: colors.primaryTint },
  ghost:     { bg: 'transparent',      fg: colors.primaryDark, border: 'transparent' },
  danger:    { bg: colors.dangerSoft,  fg: colors.danger,      border: colors.dangerSoft },
  gold:      { bg: colors.gold,        fg: colors.primaryDeep, border: colors.gold },
};

const sizes: Record<Size, { py: number; px: number; fs: number }> = {
  sm: { py: 8,  px: 12, fs: 13 },
  md: { py: 12, px: 16, fs: 14 },
  lg: { py: 14, px: 20, fs: 15 },
};

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, borderWidth: 1 },
  fullWidth: { alignSelf: 'stretch' },
  disabled: { opacity: 0.55 },
  content: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { fontWeight: typography.bodyStrong.fontWeight },
});
