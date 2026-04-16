import { EnergySignalBars } from '@/components/EnergySignalBars';
import { logMood } from '@/lib/moodStories';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const STORY_MIN = 12;

/** Align with Explore: bg, ink, accent */
const BG_TOP = '#ffffff';
const BG_BOTTOM = '#f1f5f9';
const TEXT = '#0f172a';
const MUTED = '#64748b';
const ACCENT = '#ec4899';
const BORDER = '#e2e8f0';

const SCREEN_W = Dimensions.get('window').width;

type Props = {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
};

/** Whisper-thin scribbles — readable on white */
function AmbientDoodles() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width={SCREEN_W} height={200} style={styles.doodleTop}>
        <Path
          d={`M0 72 Q ${SCREEN_W * 0.15} 36 ${SCREEN_W * 0.3} 84 T ${SCREEN_W * 0.52} 64 Q ${SCREEN_W * 0.78} 44 ${SCREEN_W} 92`}
          stroke="rgba(99,102,241,0.11)"
          strokeWidth={1.5}
          fill="none"
        />
        <Path
          d={`M${SCREEN_W * 0.06} 128 Q ${SCREEN_W * 0.22} 92 ${SCREEN_W * 0.38} 138 T ${SCREEN_W * 0.7} 118`}
          stroke="rgba(236,72,153,0.1)"
          strokeWidth={1.2}
          fill="none"
        />
      </Svg>
      <Svg width={SCREEN_W} height={160} style={styles.doodleBottom}>
        <Path
          d={`M${-8} 36 Q ${SCREEN_W * 0.18} 88 ${SCREEN_W * 0.08} 128 Q ${SCREEN_W * 0.04} 168 ${SCREEN_W * 0.22} 148 Q ${SCREEN_W * 0.48} 118 ${SCREEN_W * 0.68} 158`}
          stroke="rgba(148,163,184,0.18)"
          strokeWidth={1.3}
          fill="none"
        />
        <Path
          d={`M${SCREEN_W * 0.42} 12 Q ${SCREEN_W * 0.58} 52 ${SCREEN_W * 0.48} 92 Q ${SCREEN_W * 0.38} 128 ${SCREEN_W * 0.62} 108 Q ${SCREEN_W * 0.82} 92 ${SCREEN_W} 138`}
          stroke="rgba(99,102,241,0.05)"
          strokeWidth={1}
          fill="none"
        />
      </Svg>
    </View>
  );
}

export function StoryCheckinModal({ visible, onClose, onSaved }: Props) {
  const insets = useSafeAreaInsets();
  const [story, setStory] = useState('');
  const [mood, setMood] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      setStory('');
      setMood(null);
      setSaving(false);
    }
  }, [visible]);

  const pickMood = useCallback((v: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setMood(v);
  }, []);

  const handleSave = async () => {
    const t = story.trim();
    if (t.length < STORY_MIN) {
      Alert.alert('A little more', `Share at least ${STORY_MIN} characters — a sentence or two about today.`);
      return;
    }
    const moodVal = mood ?? 3;
    setSaving(true);
    try {
      const entry = await logMood(moodVal, t);
      if (entry) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        onSaved();
        onClose();
      } else {
        Alert.alert('Couldn’t save', 'Check you’re online and try again.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const canSave = story.trim().length >= STORY_MIN && !saving;
  const len = story.trim().length;

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
      <LinearGradient colors={[BG_TOP, '#f8fafc', BG_BOTTOM]} locations={[0, 0.4, 1]} style={StyleSheet.absoluteFill} />
      <AmbientDoodles />
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
        >
          <ScrollView
            style={styles.scroll}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollInner}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.topBar}>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Back"
              >
                <Feather name="chevron-left" size={26} color={TEXT} />
                <Text style={styles.backLabel}>Back</Text>
              </Pressable>
            </View>

            <Text style={styles.kicker}>{"Tonight's branch"}</Text>
            <Text style={styles.title}>What happened{'\n'}in your world?</Text>
            <Text style={styles.sub}>
              No grades, no filter — just the real texture of your day. It lands in the scribble below.
            </Text>

            <View style={styles.inputShell}>
              <TextInput
                style={styles.input}
                placeholder="Slow coffee, awkward text, a laugh, a worry…"
                placeholderTextColor="#94a3b8"
                value={story}
                onChangeText={setStory}
                multiline
                maxLength={2000}
                textAlignVertical="top"
              />
              <Text style={styles.counterInside}>
                {len}/{STORY_MIN}+
              </Text>
            </View>

            <View style={styles.energyCard}>
              <Text style={styles.moodTitle}>Energy check</Text>
              <Text style={styles.moodSub}>Tap a level — optional (defaults to balanced).</Text>
              <EnergySignalBars
                level={mood ?? 3}
                interactive
                selectedLevel={mood}
                onSelectLevel={pickMood}
                appearance="light"
              />
            </View>
          </ScrollView>

          <View
            style={[
              styles.footer,
              {
                paddingBottom: Math.max(insets.bottom, 14),
              },
            ]}
          >
            <Pressable
              onPress={handleSave}
              disabled={!canSave}
              style={({ pressed }) => [
                styles.saveBtnOuter,
                !canSave && styles.saveBtnOuterDisabled,
                pressed && canSave && styles.saveBtnOuterPressed,
              ]}
            >
              {saving ? (
                <LinearGradient
                  colors={['#fda4af', '#ec4899', '#db2777']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.saveGradInner}
                >
                  <ActivityIndicator color="#fff" />
                </LinearGradient>
              ) : !canSave ? (
                <View style={[styles.saveGradInner, styles.saveGradInnerMuted]}>
                  <Text style={[styles.sproutIcon, styles.saveTxtMuted]}>🌱</Text>
                  <Text style={[styles.saveTxt, styles.saveTxtMuted]}>Plant my story</Text>
                </View>
              ) : (
                <LinearGradient
                  colors={['#fda4af', '#ec4899', '#db2777']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.saveGradInner}
                >
                  <Text style={styles.sproutIcon}>🌱</Text>
                  <Text style={styles.saveTxt}>Plant my story</Text>
                </LinearGradient>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  flex: { flex: 1 },
  scroll: {
    flex: 1,
  },
  scrollInner: {
    paddingHorizontal: 22,
    paddingBottom: 20,
    flexGrow: 1,
  },
  footer: {
    paddingHorizontal: 22,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(226, 232, 240, 0.95)',
    backgroundColor: 'rgba(248, 250, 252, 0.97)',
  },
  doodleTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  doodleBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    marginHorizontal: -4,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingRight: 14,
    paddingLeft: 2,
    gap: 2,
  },
  backBtnPressed: {
    opacity: 0.7,
  },
  backLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: TEXT,
    letterSpacing: -0.2,
  },
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 3.2,
    textTransform: 'uppercase',
    color: ACCENT,
    marginBottom: 12,
    marginTop: 4,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: TEXT,
    lineHeight: 36,
    letterSpacing: -0.8,
    marginBottom: 12,
  },
  sub: {
    fontSize: 15,
    lineHeight: 22,
    color: MUTED,
    marginBottom: 24,
    fontWeight: '400',
  },
  inputShell: {
    position: 'relative',
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 28,
    minHeight: 176,
    overflow: 'hidden',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 28,
    elevation: 5,
  },
  input: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 40,
    fontSize: 16,
    lineHeight: 24,
    color: TEXT,
    fontWeight: '400',
    minHeight: 176,
  },
  counterInside: {
    position: 'absolute',
    right: 14,
    bottom: 12,
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  energyCard: {
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 14,
    borderRadius: 22,
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#f1f5f9',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 16,
    elevation: 3,
  },
  moodTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: TEXT,
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  moodSub: {
    fontSize: 13,
    color: MUTED,
    marginBottom: 18,
    lineHeight: 19,
  },
  saveBtnOuter: {
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#ec4899',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 8,
  },
  saveBtnOuterDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  saveBtnOuterPressed: {
    opacity: 0.94,
  },
  saveGradInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 17,
    paddingHorizontal: 24,
    gap: 10,
  },
  saveGradInnerMuted: {
    backgroundColor: '#e2e8f0',
  },
  sproutIcon: {
    fontSize: 20,
    marginTop: -1,
  },
  saveTxt: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    letterSpacing: 0.2,
  },
  saveTxtMuted: {
    color: '#94a3b8',
  },
});
