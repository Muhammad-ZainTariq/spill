import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getLoginStatsForAdmin } from '../functions';

const screenWidth = Dimensions.get('window').width;
const CHART_WIDTH = screenWidth - 48;
const DAYS = 14;

const chartConfig = {
  backgroundColor: '#fff',
  backgroundGradientFrom: '#faf5f7',
  backgroundGradientTo: '#fff',
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(236, 72, 153, ${opacity})`,
  labelColor: (opacity = 1) => `rgba(55, 65, 81, ${opacity})`,
  style: { borderRadius: 16 },
  barPercentage: 0.7,
};

export default function LoginStatsScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<{ date: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await getLoginStatsForAdmin(DAYS);
    setStats(data);
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const labels = stats.map((s) => {
    const d = new Date(s.date);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  });
  const values = stats.map((s) => s.count);
  const total = values.reduce((a, b) => a + b, 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={24} color="#333" />
        </Pressable>
        <Text style={styles.headerTitle}>Login stats</Text>
        <View style={styles.backBtn} />
      </View>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#ec4899" />}
      >
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#ec4899" />
            <Text style={styles.loadingText}>Loading…</Text>
          </View>
        ) : (
          <>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total logins (last {DAYS} days)</Text>
              <Text style={styles.summaryValue}>{total}</Text>
            </View>
            <Text style={styles.chartTitle}>Logins per day</Text>
            {stats.length > 0 && values.some((v) => v > 0) ? (
              <BarChart
                data={{
                  labels,
                  datasets: [{ data: values }],
                }}
                width={CHART_WIDTH}
                height={260}
                yAxisLabel=""
                yAxisSuffix=""
                chartConfig={chartConfig}
                style={styles.chart}
                fromZero
              />
            ) : stats.length > 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No logins in the last {DAYS} days.</Text>
              </View>
            ) : (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No login data yet.</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8f9fa' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#333' },
  scroll: { padding: 20, paddingBottom: 40 },
  centered: { paddingVertical: 48, alignItems: 'center' },
  loadingText: { marginTop: 12, color: '#666' },
  summaryCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryLabel: { fontSize: 14, color: '#6b7280', marginBottom: 4 },
  summaryValue: { fontSize: 32, fontWeight: '800', color: '#ec4899' },
  chartTitle: { fontSize: 16, fontWeight: '700', color: '#374151', marginBottom: 12 },
  chart: { marginVertical: 8, borderRadius: 16 },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#6b7280', fontSize: 15 },
});
