import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radii, spacing } from '../../theme';

type Tone = 'neutral' | 'primary' | 'gold' | 'success' | 'warning' | 'danger';

export function Chip({
  label,
  tone = 'neutral',
  active = false,
  onPress,
}: {
  label: string;
  tone?: Tone;
  active?: boolean;
  onPress?: () => void;
}) {
  const palette = active ? activeTones[tone] : tones[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.chip, { backgroundColor: palette.bg, borderColor: palette.border }]}
    >
      <Text style={[styles.label, { color: palette.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const tones: Record<Tone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: colors.surfaceMuted, fg: colors.textSecondary, border: colors.border },
  primary: { bg: colors.primarySoft,  fg: colors.primaryDark,   border: colors.primaryTint },
  gold:    { bg: colors.goldSoft,     fg: colors.goldDark,      border: colors.goldSoft },
  success: { bg: colors.primarySoft,  fg: colors.success,       border: colors.primaryTint },
  warning: { bg: colors.warningSoft,  fg: colors.warning,       border: colors.warningSoft },
  danger:  { bg: colors.dangerSoft,   fg: colors.danger,        border: colors.dangerSoft },
};

const activeTones: Record<Tone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: colors.primaryDark, fg: colors.textInverse, border: colors.primaryDark },
  primary: { bg: colors.primary,     fg: colors.textInverse, border: colors.primary },
  gold:    { bg: colors.gold,        fg: colors.primaryDeep, border: colors.gold },
  success: { bg: colors.primary,     fg: colors.textInverse, border: colors.primary },
  warning: { bg: colors.warning,     fg: colors.textInverse, border: colors.warning },
  danger:  { bg: colors.danger,      fg: colors.textInverse, border: colors.danger },
};

const styles = StyleSheet.create({
  chip: {
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  label: { fontSize: 12, fontWeight: '800' },
});
