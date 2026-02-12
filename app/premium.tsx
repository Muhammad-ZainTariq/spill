import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const premiumFeatures = [
  { icon: 'users', title: 'Private Groups', description: 'Create exclusive spaces for shared experiences' },
  { icon: 'zap', title: 'Fun Group Challenges', description: 'Share a Win Wednesday, Mood Meme Battles & more' },
  { icon: 'user-check', title: 'Unlimited Follows', description: 'Connect with as many people as you want' },
  { icon: 'cpu', title: 'Priority AI Insights', description: 'Personal coping tips and reflection prompts' },
  { icon: 'eye-off', title: 'Ad-Free Browsing', description: 'Enjoy distraction-free experience' },
  { icon: 'trending-up', title: 'Mood Tracking', description: 'Track patterns and see your growth over time' },
  { icon: 'award', title: 'Exclusive Badges', description: 'Show your premium status' },
  { icon: 'message-circle', title: 'Priority Support', description: 'Get help when you need it most' },
];

export default function PremiumScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable onPress={() => router.back()}>
          <Feather name="arrow-left" size={24} color="#333" />
        </Pressable>
        <Text style={styles.headerTitle}>Go Premium</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero Section */}
        <LinearGradient
          colors={['#ec4899', '#f472b6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}
        >
          <Text style={styles.heroTitle}>Unlock Premium</Text>
          <Text style={styles.heroSubtitle}>
            Get access to exclusive tools designed to support your mental health journey
          </Text>
        </LinearGradient>

        {/* Features Grid */}
        <View style={styles.featuresSection}>
          <Text style={styles.sectionTitle}>Premium Features</Text>
          <View style={styles.featuresGrid}>
            {premiumFeatures.map((feature, index) => (
              <View key={index} style={styles.featureCard}>
                <View style={styles.featureIconContainer}>
                  <Feather name={feature.icon as any} size={24} color="#ec4899" />
                </View>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDescription}>{feature.description}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Pricing Cards */}
        <View style={styles.pricingSection}>
          <Text style={styles.sectionTitle}>Choose Your Plan</Text>
          
          {/* Yearly Plan - Best Value */}
          <Pressable
            style={styles.pricingCard}
            onPress={() => router.push('/payment?plan=yearly' as any)}
          >
            <View style={styles.bestValueBadge}>
              <Text style={styles.bestValueText}>BEST VALUE</Text>
            </View>
            <View style={styles.pricingHeader}>
              <Text style={styles.planName}>Yearly</Text>
              <View style={styles.priceContainer}>
                <Text style={styles.currency}>£</Text>
                <Text style={styles.price}>49.99</Text>
                <Text style={styles.period}>/year</Text>
              </View>
              <Text style={styles.savings}>Save 17% vs monthly</Text>
            </View>
            <View style={styles.pricingFooter}>
              <Feather name="arrow-right" size={20} color="#ec4899" />
            </View>
          </Pressable>

          {/* Monthly Plan */}
          <Pressable
            style={[styles.pricingCard, styles.pricingCardSecondary]}
            onPress={() => router.push('/payment?plan=monthly' as any)}
          >
            <View style={styles.pricingHeader}>
              <Text style={styles.planName}>Monthly</Text>
              <View style={styles.priceContainer}>
                <Text style={styles.currency}>£</Text>
                <Text style={styles.price}>4.99</Text>
                <Text style={styles.period}>/month</Text>
              </View>
            </View>
            <View style={styles.pricingFooter}>
              <Feather name="arrow-right" size={20} color="#6b7280" />
            </View>
          </Pressable>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  content: {
    flex: 1,
  },
  hero: {
    paddingHorizontal: 24,
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.95)',
    textAlign: 'center',
    lineHeight: 24,
    maxWidth: 300,
  },
  featuresSection: {
    paddingHorizontal: 16,
    paddingTop: 32,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 20,
  },
  featuresGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -6,
  },
  featureCard: {
    width: '50%',
    paddingHorizontal: 6,
    marginBottom: 16,
  },
  featureIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#fdf2f8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 6,
  },
  featureDescription: {
    fontSize: 12,
    color: '#6b7280',
    lineHeight: 18,
  },
  pricingSection: {
    paddingHorizontal: 16,
    paddingTop: 32,
  },
  pricingCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#ec4899',
    shadowColor: '#ec4899',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    position: 'relative',
  },
  pricingCardSecondary: {
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOpacity: 0.05,
  },
  bestValueBadge: {
    position: 'absolute',
    top: -12,
    right: 24,
    backgroundColor: '#ec4899',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    shadowColor: '#ec4899',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  bestValueText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  pricingHeader: {
    marginBottom: 16,
  },
  planName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  currency: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
  },
  price: {
    fontSize: 40,
    fontWeight: '800',
    color: '#111827',
  },
  period: {
    fontSize: 16,
    color: '#6b7280',
    marginLeft: 4,
  },
  savings: {
    fontSize: 13,
    color: '#10b981',
    fontWeight: '600',
  },
  pricingFooter: {
    alignItems: 'flex-end',
  },
});

