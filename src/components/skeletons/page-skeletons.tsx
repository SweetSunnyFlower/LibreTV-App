import { SkeletonBlock, SkeletonGroup } from '@/components/skeletons/skeleton';
import { useTheme } from '@/hooks/use-theme';
import { StyleSheet, type StyleProp, View, type ViewStyle } from 'react-native';

type ListSkeletonVariant = 'download' | 'history' | 'menu' | 'site';

type ListSkeletonProps = {
  rows?: number;
  variant: ListSkeletonVariant;
  contentContainerStyle?: StyleProp<ViewStyle>;
  inset?: number;
};

export function ListSkeleton({ rows = 4, variant, contentContainerStyle, inset }: ListSkeletonProps) {
  const colors = useTheme();
  const rowInset = inset ?? (variant === 'menu' ? 0 : 16);

  return (
    <SkeletonGroup>
      <View style={[styles.list, contentContainerStyle]}>
        {Array.from({ length: rows }, (_, index) => (
          <View
            key={`${variant}-skeleton-${index}`}
            style={[
              styles.row,
              styles[`${variant}Row`],
              { borderBottomColor: colors.backgroundSelected, marginHorizontal: rowInset },
            ]}>
            <SkeletonBlock style={[styles.icon, variant === 'download' && styles.downloadIcon]} />
            <View style={styles.lines}>
              <SkeletonBlock
                style={[
                  styles.line,
                  variant === 'menu' && styles.menuTitle,
                  variant === 'site' && styles.siteTitle,
                  variant === 'download' && styles.downloadTitle,
                  variant === 'history' && styles.historyTitle,
                ]}
              />
              <SkeletonBlock
                style={[
                  styles.line,
                  styles.secondaryLine,
                  variant === 'menu' && styles.menuSubtitle,
                  variant === 'site' && styles.siteUrl,
                  variant === 'download' && styles.downloadSubtitle,
                  variant === 'history' && styles.historySubtitle,
                ]}
              />
              {variant === 'site' ? (
                <SkeletonBlock style={[styles.line, styles.siteDetail]} />
              ) : null}
            </View>
            <SkeletonBlock
              style={[
                styles.trailing,
                variant === 'menu' && styles.menuCount,
                variant === 'site' && styles.siteAction,
              ]}
            />
          </View>
        ))}
      </View>
    </SkeletonGroup>
  );
}

export function SettingsSkeleton({ rows = 6 }: { rows?: number }) {
  const colors = useTheme();

  return (
    <SkeletonGroup>
      <View style={styles.settingsList}>
        {Array.from({ length: rows }, (_, index) => (
          <View key={`settings-skeleton-${index}`} style={[styles.settingsRow, { borderBottomColor: colors.backgroundSelected }]}>
            <View style={styles.lines}>
              <SkeletonBlock style={[styles.line, styles.settingsTitle]} />
              <SkeletonBlock style={[styles.line, styles.settingsSubtitle]} />
            </View>
            <SkeletonBlock style={[styles.control, index === 0 && styles.segmentedControl]} />
          </View>
        ))}
      </View>
    </SkeletonGroup>
  );
}

export function SiteFormSkeleton() {
  return (
    <SkeletonGroup>
      <View style={styles.form}>
        {Array.from({ length: 3 }, (_, index) => (
          <View key={`site-form-skeleton-${index}`} style={styles.field}>
            <SkeletonBlock style={[styles.line, styles.fieldLabel]} />
            <SkeletonBlock style={styles.fieldInput} />
          </View>
        ))}
        <SkeletonBlock style={styles.helper} />
      </View>
    </SkeletonGroup>
  );
}

const styles = StyleSheet.create({
  list: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuRow: {
    minHeight: 70,
    gap: 12,
  },
  historyRow: {
    minHeight: 70,
    gap: 12,
  },
  downloadRow: {
    minHeight: 78,
    gap: 12,
  },
  siteRow: {
    minHeight: 88,
    gap: 12,
  },
  icon: {
    width: 20,
    height: 20,
  },
  downloadIcon: {
    width: 32,
    height: 32,
  },
  lines: {
    flex: 1,
    gap: 8,
  },
  line: {
    width: '52%',
    height: 13,
  },
  secondaryLine: {
    height: 10,
  },
  menuTitle: {
    width: '34%',
    height: 15,
  },
  menuSubtitle: {
    width: '52%',
  },
  historyTitle: {
    width: '46%',
    height: 15,
  },
  historySubtitle: {
    width: '68%',
  },
  downloadTitle: {
    width: '44%',
    height: 15,
  },
  downloadSubtitle: {
    width: '62%',
  },
  siteTitle: {
    width: '32%',
    height: 15,
  },
  siteUrl: {
    width: '64%',
  },
  siteDetail: {
    width: '48%',
    height: 10,
  },
  trailing: {
    width: 18,
    height: 18,
  },
  menuCount: {
    width: 22,
    height: 13,
  },
  siteAction: {
    width: 42,
    height: 16,
  },
  settingsList: {
    width: '100%',
  },
  settingsRow: {
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  settingsTitle: {
    width: '34%',
    height: 15,
  },
  settingsSubtitle: {
    width: '62%',
  },
  control: {
    width: 54,
    height: 30,
  },
  segmentedControl: {
    width: 126,
  },
  form: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 26,
  },
  field: {
    gap: 12,
  },
  fieldLabel: {
    width: '28%',
    height: 14,
  },
  fieldInput: {
    width: '100%',
    height: 36,
  },
  helper: {
    width: '78%',
    height: 34,
    marginTop: 4,
  },
});
