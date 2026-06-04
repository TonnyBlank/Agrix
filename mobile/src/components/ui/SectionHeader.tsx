import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../theme';

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.text}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View>{right}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md, marginBottom: spacing.md },
  text: { flex: 1, gap: 2 },
  eyebrow: { color: colors.primary, fontSize: 11, fontWeight: '900', letterSpacing: 1, textTransform: 'uppercase' },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.textSecondary },
});
