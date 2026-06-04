import { ScrollView, StyleSheet, View, ViewProps } from 'react-native';
import { colors, spacing } from '../../theme';

export function Screen({ children, scroll = true, padded = true }: { children: React.ReactNode; scroll?: boolean; padded?: boolean }) {
  const content = (
    <View style={[styles.inner, padded && styles.padded]}>{children}</View>
  );
  if (!scroll) return <View style={styles.screen}>{content}</View>;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: spacing.xxxl }} showsVerticalScrollIndicator={false}>
      {content}
    </ScrollView>
  );
}

export function Stack({ gap = spacing.md, style, ...rest }: ViewProps & { gap?: number }) {
  return <View {...rest} style={[{ gap }, style]} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  inner: { gap: spacing.lg },
  padded: { padding: spacing.lg },
});
