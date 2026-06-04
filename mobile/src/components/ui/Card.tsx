import { StyleSheet, View, ViewProps } from 'react-native';
import { colors, radii, spacing, shadows } from '../../theme';

export function Card({ style, elevated = false, ...rest }: ViewProps & { elevated?: boolean }) {
  return (
    <View
      {...rest}
      style={[styles.card, elevated ? shadows.elevated : shadows.card, style]}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
});
