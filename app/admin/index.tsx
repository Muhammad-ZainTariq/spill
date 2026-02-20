import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AdminDashboard() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Admin</Text>
        <Text style={styles.subtitle}>Admin view</Text>
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable
          style={styles.card}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/admin/add-staff');
          }}
        >
          <Feather name="user-plus" size={28} color="#ec4899" />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Add staff</Text>
            <Text style={styles.cardDesc}>Create a staff account (email + password). Staff can sign in without email verification.</Text>
          </View>
          <Feather name="chevron-right" size={22} color="#9ca3af" />
        </Pressable>
        <Pressable
          style={styles.card}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/create-challenge?official=1' as any);
          }}
        >
          <Feather name="zap" size={28} color="#ec4899" />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Create challenge</Text>
            <Text style={styles.cardDesc}>Create an official (admin-managed) challenge. Anyone can join from the app.</Text>
          </View>
          <Feather name="chevron-right" size={22} color="#9ca3af" />
        </Pressable>
        <Pressable
          style={styles.card}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push('/admin/login-stats');
          }}
        >
          <Feather name="bar-chart-2" size={28} color="#ec4899" />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Login stats</Text>
            <Text style={styles.cardDesc}>View login counts per day in a chart.</Text>
          </View>
          <Feather name="chevron-right" size={22} color="#9ca3af" />
        </Pressable>
        <Pressable
          style={styles.card}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.replace('/(tabs)');
          }}
        >
          <Feather name="log-out" size={28} color="#6b7280" />
          <View style={styles.cardText}>
            <Text style={[styles.cardTitle, { color: '#374151' }]}>Switch to app</Text>
            <Text style={styles.cardDesc}>Use the app as a normal user.</Text>
          </View>
          <Feather name="chevron-right" size={22} color="#9ca3af" />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8f9fa' },
  header: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: { fontSize: 28, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6b7280', marginTop: 4, fontWeight: '600' },
  scroll: { padding: 20, paddingBottom: 40 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardText: { flex: 1, marginLeft: 16 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#ec4899' },
  cardDesc: { fontSize: 13, color: '#6b7280', marginTop: 4, lineHeight: 18 },
});
