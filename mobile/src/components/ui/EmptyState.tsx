import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, spacing, typography } from '../../theme';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryTint,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: { ...typography.heading, color: colors.primaryDeep, textAlign: 'center' },
  description: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
});
