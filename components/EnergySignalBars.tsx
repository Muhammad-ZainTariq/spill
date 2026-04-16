import { Pressable, StyleSheet, Text, View } from 'react-native';

const BAR_WIDTH = 6;
const GAP = 5;

/** One accent per level — columns read as clearly different energy */
const LEVEL_ACCENTS = ['#38bdf8', '#6366f1', '#a855f7', '#ec4899', '#f97316'] as const;

function barHeightPx(index1to5: number, maxH: number) {
  return Math.round((maxH * index1to5) / 5);
}

function clampLevel(n: number) {
  return Math.min(5, Math.max(1, Math.round(n)));
}

const TRACK = '#e2e8f0';

const PALETTES = {
  light: {
    track: TRACK,
    cellBg: '#ffffff',
    cellBorder: '#e2e8f0',
    cellShadow: 'rgba(15, 23, 42, 0.06)',
  },
  dark: {
    track: 'rgba(255,255,255,0.14)',
    cellBg: 'rgba(255,255,255,0.05)',
    cellBorder: 'rgba(255,255,255,0.12)',
    cellShadow: 'rgba(0, 0, 0, 0.2)',
  },
} as const;

type Props = {
  level: number;
  compact?: boolean;
  interactive?: boolean;
  selectedLevel?: number | null;
  onSelectLevel?: (v: number) => void;
  appearance?: keyof typeof PALETTES;
};

export function EnergySignalBars({
  level,
  interactive,
  compact,
  selectedLevel,
  onSelectLevel,
  appearance = 'light',
}: Props) {
  const P = PALETTES[appearance];
  const maxH = compact ? 24 : 34;
  const rowH = maxH + 6;
  const display = clampLevel(level);

  const accentFor = (displayLevel: number) =>
    LEVEL_ACCENTS[clampLevel(displayLevel) - 1] ?? LEVEL_ACCENTS[2];

  const barsFor = (displayLevel: number) => {
    const fill = accentFor(displayLevel);
    return (
      <View style={[styles.row, { height: rowH }]}>
        {[1, 2, 3, 4, 5].map((i) => {
          const filled = i <= displayLevel;
          const h = barHeightPx(i, maxH);
          return (
            <View key={i} style={[styles.barHit, { height: maxH }]}>
              <View
                style={[
                  styles.bar,
                  { height: h },
                  {
                    backgroundColor: filled ? fill : P.track,
                    opacity: filled ? 1 : appearance === 'dark' ? 0.5 : 0.65,
                  },
                ]}
              />
            </View>
          );
        })}
      </View>
    );
  };

  if (interactive && onSelectLevel) {
    return (
      <View style={styles.pickerWrap}>
        <View style={styles.pickerRow}>
          {[1, 2, 3, 4, 5].map((v) => {
            const on = selectedLevel === v;
            const accent = accentFor(v);
            return (
              <Pressable
                key={v}
                onPress={() => onSelectLevel(v)}
                style={({ pressed }) => [
                  styles.pickerCell,
                  {
                    backgroundColor: P.cellBg,
                    borderColor: on ? accent : P.cellBorder,
                    borderWidth: on ? 2 : 1,
                    shadowColor: on ? accent : P.cellShadow,
                    shadowOffset: { width: 0, height: on ? 6 : 2 },
                    shadowOpacity: on ? 0.35 : 0.08,
                    shadowRadius: on ? 12 : 6,
                    elevation: on ? 6 : 2,
                    transform: [{ scale: on ? 1.02 : 1 }],
                  },
                  pressed && styles.pickerCellPressed,
                ]}
              >
                {barsFor(v)}
                <Text style={[styles.stepLabel, { color: on ? accent : '#94a3b8' }]}>{v}</Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.rangeHint}>
          <Text style={styles.rangeHintText}>Low</Text>
          <Text style={styles.rangeHintText}>High</Text>
        </View>
      </View>
    );
  }

  const fill = accentFor(display);
  return (
    <View style={[styles.row, { height: rowH }]}>
      {[1, 2, 3, 4, 5].map((i) => {
        const filled = i <= display;
        const h = barHeightPx(i, maxH);
        return (
          <View key={i} style={[styles.barHit, { height: maxH }]}>
            <View
              style={[
                styles.bar,
                { height: h },
                { backgroundColor: filled ? fill : TRACK, opacity: filled ? 1 : 0.45 },
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pickerWrap: {
    marginBottom: 4,
  },
  pickerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 8,
  },
  pickerCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: 12,
    paddingBottom: 8,
    paddingHorizontal: 4,
    borderRadius: 18,
    minHeight: 88,
  },
  pickerCellPressed: {
    opacity: 0.92,
  },
  stepLabel: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  rangeHint: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingHorizontal: 4,
  },
  rangeHintText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: GAP,
  },
  barHit: {
    justifyContent: 'flex-end',
    alignItems: 'center',
    width: BAR_WIDTH,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: 3,
  },
});
