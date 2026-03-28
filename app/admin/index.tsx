import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tokens } from '@/app/ui/tokens';

export default function AdminDashboard() {
  const router = useRouter();

  const open = (path: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(path as any);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerIconBtn} />
        <Text style={styles.title}>spill</Text>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.replace('/(tabs)');
          }}
          style={styles.headerIconBtn}
          hitSlop={10}
        >
          <Feather name="arrow-left" size={18} color={tokens.colors.text} />
        </Pressable>
      </View>
      <View style={styles.headerSub}>
        <Text style={styles.headerSubEyebrow}>Dashboard</Text>
        <Text style={styles.headerSubTitle}>Admin</Text>
        <Text style={styles.headerSubMeta}>Manage staff, moderation, therapist operations, and tools.</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable
          style={styles.heroCard}
          onPress={() => open('/admin/resources')}
        >
          <View style={styles.heroTop}>
            <View style={[styles.heroIconWrap, { backgroundColor: 'rgba(14,165,233,0.10)' }]}>
              <Feather name="book-open" size={26} color={tokens.colors.blue} />
            </View>
            <View style={styles.heroArrow}>
              <Feather name="arrow-up-right" size={18} color={tokens.colors.blue} />
            </View>
          </View>
          <Text style={styles.heroEyebrow}>Featured</Text>
          <Text style={styles.heroTitle}>Therapist resources</Text>
          <Text style={styles.heroDesc}>Add YouTube videos and PDF books/articles for therapists.</Text>
        </Pressable>

        <View style={styles.grid}>
          <Pressable style={styles.tile} onPress={() => open('/admin/add-staff')}>
            <View style={[styles.tileIcon, { backgroundColor: 'rgba(244,114,182,0.10)' }]}>
              <Feather name="user-plus" size={20} color={tokens.colors.pink} />
            </View>
            <Text style={styles.tileMeta}>Access</Text>
            <Text style={styles.tileTitle}>Add staff</Text>
            <Text style={styles.tileDesc}>Create staff accounts with email and password.</Text>
            <View style={styles.tileLink}>
              <Text style={styles.tileLinkText}>Open</Text>
              <Feather name="chevron-right" size={16} color={tokens.colors.pink} />
            </View>
          </Pressable>

          <Pressable style={styles.tile} onPress={() => open('/admin/therapists')}>
            <View style={[styles.tileIcon, { backgroundColor: 'rgba(16,185,129,0.10)' }]}>
              <Feather name="user-check" size={20} color={tokens.colors.green} />
            </View>
            <Text style={styles.tileMeta}>Therapists</Text>
            <Text style={styles.tileTitle}>Onboarding</Text>
            <Text style={styles.tileDesc}>Review therapist requests and send invite codes.</Text>
            <View style={styles.tileLink}>
              <Text style={styles.tileLinkText}>Open</Text>
              <Feather name="chevron-right" size={16} color={tokens.colors.pink} />
            </View>
          </Pressable>

          <Pressable style={styles.tile} onPress={() => open('/admin/therapist-progress')}>
            <View style={[styles.tileIcon, { backgroundColor: 'rgba(244,114,182,0.10)' }]}>
              <Feather name="activity" size={20} color={tokens.colors.pink} />
            </View>
            <Text style={styles.tileMeta}>Status</Text>
            <Text style={styles.tileTitle}>Progress</Text>
            <Text style={styles.tileDesc}>Uploads, open reviews, and therapist follow-up.</Text>
            <View style={styles.tileLink}>
              <Text style={styles.tileLinkText}>Open</Text>
              <Feather name="chevron-right" size={16} color={tokens.colors.pink} />
            </View>
          </Pressable>

          <Pressable style={styles.tile} onPress={() => open('/admin/login-stats')}>
            <View style={[styles.tileIcon, { backgroundColor: 'rgba(14,165,233,0.10)' }]}>
              <Feather name="bar-chart-2" size={20} color={tokens.colors.blue} />
            </View>
            <Text style={styles.tileMeta}>Analytics</Text>
            <Text style={styles.tileTitle}>Login stats</Text>
            <Text style={styles.tileDesc}>View login counts per day in a chart.</Text>
            <View style={styles.tileLink}>
              <Text style={styles.tileLinkText}>Open</Text>
              <Feather name="chevron-right" size={16} color={tokens.colors.pink} />
            </View>
          </Pressable>

          <Pressable style={[styles.tile, styles.tileWide]} onPress={() => open('/create-challenge?official=1')}>
            <View style={[styles.tileIcon, { backgroundColor: 'rgba(244,114,182,0.10)' }]}>
              <Feather name="zap" size={20} color={tokens.colors.pink} />
            </View>
            <Text style={styles.tileMeta}>Community</Text>
            <Text style={styles.tileTitle}>Create challenge</Text>
            <Text style={styles.tileDesc}>Launch an official admin-managed challenge for the whole app.</Text>
            <View style={styles.tileLink}>
              <Text style={styles.tileLinkText}>Open</Text>
              <Feather name="chevron-right" size={16} color={tokens.colors.pink} />
            </View>
          </Pressable>

          <Pressable style={styles.tile} onPress={() => open('/admin/flagged')}>
            <View style={[styles.tileIcon, { backgroundColor: 'rgba(239,68,68,0.10)' }]}>
              <Feather name="alert-triangle" size={20} color={tokens.colors.danger} />
            </View>
            <Text style={styles.tileMeta}>Moderation</Text>
            <Text style={styles.tileTitle}>Flagged stuff</Text>
            <Text style={styles.tileDesc}>Review posts auto-flagged by moderation.</Text>
            <View style={styles.tileLink}>
              <Text style={styles.tileLinkText}>Open</Text>
              <Feather name="chevron-right" size={16} color={tokens.colors.pink} />
            </View>
          </Pressable>

          <Pressable style={styles.tile} onPress={() => open('/admin/reports')}>
            <View style={[styles.tileIcon, { backgroundColor: 'rgba(244,114,182,0.10)' }]}>
              <Feather name="shield" size={20} color={tokens.colors.pink} />
            </View>
            <Text style={styles.tileMeta}>Safety</Text>
            <Text style={styles.tileTitle}>Reports</Text>
            <Text style={styles.tileDesc}>Review user-submitted DM reports and investigate.</Text>
            <View style={styles.tileLink}>
              <Text style={styles.tileLinkText}>Open</Text>
              <Feather name="chevron-right" size={16} color={tokens.colors.pink} />
            </View>
          </Pressable>

          <Pressable
            style={[styles.tile, styles.tileWide, styles.tileNeutral]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.replace('/(tabs)');
            }}
          >
            <View style={[styles.tileIcon, { backgroundColor: 'rgba(100,116,139,0.10)' }]}>
              <Feather name="log-out" size={20} color={tokens.colors.gray} />
            </View>
            <Text style={styles.tileMeta}>Exit</Text>
            <Text style={[styles.tileTitle, { color: tokens.colors.text }]}>Switch to app</Text>
            <Text style={styles.tileDesc}>Leave the admin dashboard and return to the normal app.</Text>
            <View style={styles.tileLink}>
              <Text style={styles.tileLinkText}>Open</Text>
              <Feather name="chevron-right" size={16} color={tokens.colors.pink} />
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: tokens.colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: tokens.spacing.screenHorizontal,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: tokens.colors.surface,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    marginHorizontal: 12,
    fontSize: 24,
    fontWeight: '900',
    color: tokens.colors.pink,
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  headerSub: {
    paddingHorizontal: tokens.spacing.screenHorizontal,
    paddingTop: 4,
    paddingBottom: 14,
    backgroundColor: tokens.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
  },
  headerSubEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: tokens.colors.textMuted,
  },
  headerSubTitle: {
    marginTop: 6,
    fontSize: 24,
    fontWeight: '900',
    color: tokens.colors.text,
  },
  headerSubMeta: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
    color: tokens.colors.textSecondary,
  },
  scroll: { padding: tokens.spacing.screenHorizontal, paddingBottom: 36, gap: 16 },
  heroCard: {
    padding: 18,
    borderRadius: 24,
    backgroundColor: '#fff4f8',
    borderWidth: 1,
    borderColor: 'rgba(244,114,182,0.22)',
    marginBottom: 16,
    shadowColor: '#ec4899',
    shadowOpacity: 0.07,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  heroIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroArrow: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: 'rgba(244,114,182,0.18)',
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: tokens.colors.pink,
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: tokens.colors.text,
    lineHeight: 30,
  },
  heroDesc: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: tokens.colors.textSecondary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  tile: {
    width: '48%',
    minHeight: 188,
    backgroundColor: tokens.colors.surface,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: tokens.colors.border,
  },
  tileWide: {
    width: '100%',
    minHeight: 156,
  },
  tileNeutral: {
    backgroundColor: '#fbfcff',
  },
  tileIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  tileMeta: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: tokens.colors.textMuted,
    marginBottom: 8,
  },
  tileTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: tokens.colors.text,
  },
  tileDesc: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: tokens.colors.textSecondary,
  },
  tileLink: {
    marginTop: 'auto',
    paddingTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tileLinkText: {
    fontSize: 13,
    fontWeight: '800',
    color: tokens.colors.pink,
  },
});
