import { supabase } from '@/lib/supabase';
import { Feather } from '@expo/vector-icons';
import { Buffer } from 'buffer';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { cancelPremium, checkPremiumStatus } from './functions';

export default function SettingsScreen() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [anonymousUsername, setAnonymousUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [showBlockedAccounts, setShowBlockedAccounts] = useState(false);
  const [blockedAccounts, setBlockedAccounts] = useState<any[]>([]);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  const [isPremium, setIsPremium] = useState(false);
  const [availableForMatches, setAvailableForMatches] = useState(false);
  const [matchStruggles, setMatchStruggles] = useState<string[]>([]);
  const [showStrugglesModal, setShowStrugglesModal] = useState(false);

  const STRUGGLE_OPTIONS = [
    'Anxiety',
    'Depression',
    'Stress',
    'Loneliness',
    'Self-esteem',
    'Relationships',
    'Work/School',
    'Family',
    'Grief',
    'Trauma',
    'Addiction',
    'Other',
  ];

  useEffect(() => {
    loadUserProfile();
    checkPremium();
  }, []);

  const checkPremium = async () => {
    const premium = await checkPremiumStatus();
    setIsPremium(premium);
  };

  const loadUserProfile = async () => {
    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) {
        router.replace('/login');
        return;
      }

      setUser(currentUser);

      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

      if (profile) {
        setDisplayName(profile.display_name || '');
        setAnonymousUsername(profile.anonymous_username || '');
        setAvatarUrl(profile.avatar_url || '');
        setAvailableForMatches(profile.available_for_matches || false);
        setMatchStruggles(profile.match_struggles || []);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
      Alert.alert('Error', 'Could not load profile data.');
    }
  };

  const pickAvatar = async () => {
    try {
      const perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!req.granted) {
          Alert.alert('Permission required', 'Please allow photo library access to pick avatar.');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      setUploadingAvatar(true);

      // Upload to Supabase Storage
      const base64Data = await FileSystem.readAsStringAsync(asset.uri, { 
        encoding: FileSystem.EncodingType.Base64 
      });
      const byteArray = Buffer.from(base64Data, 'base64');

      const path = `${user.id}/avatar-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('avatar-bucket')
        .upload(path, byteArray, {
          cacheControl: '3600',
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        console.error('Upload error', uploadError);
        Alert.alert('Upload failed', 'Could not upload avatar.');
        return;
      }

      const { data } = supabase.storage.from('avatar-bucket').getPublicUrl(path);
      setAvatarUrl(data.publicUrl);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Avatar picker error', error);
      Alert.alert('Error', 'Could not pick avatar.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const generateNewUsername = async () => {
    try {
      const funnyWords = ['Silly', 'Goofy', 'Wacky', 'Zany', 'Bouncy', 'Bubbly', 'Chirpy', 'Dizzy', 'Fizzy', 'Giggly'];
      const cuteAnimals = ['Panda', 'Bunny', 'Puppy', 'Kitty', 'Duck', 'Frog', 'Bear', 'Pig', 'Bee', 'Bug'];
      const numbers = Math.floor(Math.random() * 999) + 1;

      const word = funnyWords[Math.floor(Math.random() * funnyWords.length)];
      const animal = cuteAnimals[Math.floor(Math.random() * cuteAnimals.length)];
      const username = `${word.toLowerCase()}-${animal.toLowerCase()}-${numbers}`;

      setAnonymousUsername(username);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (error) {
      console.error('Error generating username:', error);
    }
  };

  const handleSave = async () => {
    if (!user) return;

    try {
      setLoading(true);

      console.log('Updating profile with:', {
        display_name: displayName.trim() || null,
        anonymous_username: anonymousUsername.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        available_for_matches: availableForMatches,
        match_struggles: matchStruggles,
        user_id: user.id
      });

      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: displayName.trim() || null,
          anonymous_username: anonymousUsername.trim() || null,
          avatar_url: avatarUrl.trim() || null,
          available_for_matches: availableForMatches,
          match_struggles: matchStruggles,
        })
        .eq('id', user.id);

      if (error) {
        console.error('Error updating profile:', error);
        Alert.alert('Error', 'Could not update profile.');
        return;
      }

      console.log('Profile updated successfully!');

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Success', 'Profile updated successfully!', [
        { text: 'OK', onPress: () => {
          // Navigate back to refresh the feed
          router.replace('/(tabs)');
        }}
      ]);
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.replace('/login');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const loadBlockedAccounts = async () => {
    try {
      setLoadingBlocked(true);
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) return;

      const { data: blockedData, error } = await supabase
        .from('blocked_users')
        .select('blocked_id, blocked_at')
        .eq('blocker_id', currentUser.id)
        .order('blocked_at', { ascending: false });

      if (error) throw error;

      // Fetch profiles for blocked users
      const blockedIds = (blockedData || []).map(b => b.blocked_id);
      if (blockedIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, display_name, anonymous_username, avatar_url')
          .in('id', blockedIds);

        // Merge blocked data with profiles
        const blockedWithProfiles = (blockedData || []).map(blocked => ({
          ...blocked,
          blocked: profiles?.find(p => p.id === blocked.blocked_id) || null,
        }));

        setBlockedAccounts(blockedWithProfiles);
      } else {
        setBlockedAccounts([]);
      }
    } catch (error) {
      console.error('Error loading blocked accounts:', error);
      Alert.alert('Error', 'Could not load blocked accounts.');
    } finally {
      setLoadingBlocked(false);
    }
  };

  const handleUnblock = async (blockedId: string, userName: string) => {
    Alert.alert(
      'Unblock User',
      `Are you sure you want to unblock ${userName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: { user: currentUser } } = await supabase.auth.getUser();
              if (!currentUser) return;

              const { error } = await supabase
                .from('blocked_users')
                .delete()
                .eq('blocker_id', currentUser.id)
                .eq('blocked_id', blockedId);

              if (error) throw error;

              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert('Success', `${userName} has been unblocked`);
              loadBlockedAccounts();
            } catch (error) {
              console.error('Error unblocking user:', error);
              Alert.alert('Error', 'Could not unblock user.');
            }
          }
        }
      ]
    );
  };

  const openBlockedAccounts = () => {
    setShowBlockedAccounts(true);
    loadBlockedAccounts();
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backIcon}>←</Text>
          </Pressable>
          <Text style={styles.title}>Settings</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Profile Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profile</Text>
          
          {/* Avatar */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarContainer}>
              {avatarUrl ? (
                <Image source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>
                    {(displayName || anonymousUsername || 'U').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              {uploadingAvatar && (
                <View style={styles.uploadingOverlay}>
                  <ActivityIndicator color="white" size="small" />
                </View>
              )}
            </View>
            <Pressable onPress={pickAvatar} style={styles.changeAvatarButton} disabled={uploadingAvatar}>
              <Text style={styles.changeAvatarText}>
                {uploadingAvatar ? 'Uploading...' : 'Change Avatar'}
              </Text>
            </Pressable>
          </View>

          {/* Display Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Display Name</Text>
            <TextInput
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Your real name (optional)"
              placeholderTextColor="#9ca3af"
              style={styles.input}
              editable={!loading}
            />
          </View>

          {/* Anonymous Username */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Anonymous Username</Text>
            <View style={styles.usernameRow}>
              <TextInput
                value={anonymousUsername}
                onChangeText={setAnonymousUsername}
                placeholder="Generate a funny username"
                placeholderTextColor="#9ca3af"
                style={[styles.input, styles.usernameInput]}
                editable={!loading}
              />
              <Pressable onPress={generateNewUsername} style={styles.generateButton} disabled={loading}>
                <Text style={styles.generateText}>Generate</Text>
              </Pressable>
            </View>
          </View>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          
          {!isPremium ? (
            <Pressable 
              style={styles.premiumButton}
              onPress={() => router.push('/premium' as any)}
            >
              <Feather name="star" size={20} color="#ec4899" />
              <Text style={styles.premiumButtonText}>Go Premium</Text>
              <Feather name="chevron-right" size={20} color="#9ca3af" />
            </Pressable>
          ) : (
            <Pressable 
              style={styles.premiumMemberButton}
              onPress={() => {
                Alert.alert(
                  'Premium Membership',
                  'You are currently a premium member. Would you like to cancel your membership?',
                  [
                    { text: 'Keep Premium', style: 'cancel' },
                    {
                      text: 'Cancel Membership',
                      style: 'destructive',
                      onPress: () => {
                        Alert.alert(
                          'Cancel Membership',
                          'Are you sure you want to cancel? You will lose access to premium features.',
                          [
                            { text: 'Keep It', style: 'cancel' },
                            {
                              text: 'Cancel',
                              style: 'destructive',
                              onPress: async () => {
                                const success = await cancelPremium();
                                if (success) {
                                  Alert.alert(
                                    'Membership Cancelled',
                                    'Your premium membership has been cancelled. You can reactivate anytime.',
                                    [{ text: 'OK' }]
                                  );
                                  await checkPremium(); // Refresh status
                                } else {
                                  Alert.alert('Error', 'Failed to cancel membership. Please try again.');
                                }
                              },
                            },
                          ]
                        );
                      },
                    },
                  ]
                );
              }}
            >
              <Feather name="check-circle" size={20} color="#10b981" />
              <Text style={styles.premiumMemberText}>Premium Member ✓</Text>
              <Feather name="chevron-right" size={20} color="#9ca3af" />
            </Pressable>
          )}
          
          {/* Available for Matches Toggle */}
          <Pressable
            style={styles.settingToggle}
            onPress={async () => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (!availableForMatches) {
                setShowStrugglesModal(true);
              } else {
                // Disable immediately
                setAvailableForMatches(false);
                if (user) {
                  try {
                    const { error } = await supabase
                      .from('profiles')
                      .update({
                        available_for_matches: false,
                      })
                      .eq('id', user.id);

                    if (error) {
                      console.error('Error disabling matches:', error);
                      setAvailableForMatches(true); // Revert on error
                    } else {
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    }
                  } catch (error) {
                    console.error('Error saving:', error);
                    setAvailableForMatches(true); // Revert on error
                  }
                }
              }
            }}
          >
            <View style={styles.settingToggleContent}>
              <Text style={styles.settingOptionTitle}>Be Available for Matches</Text>
              <Text style={styles.settingOptionDescription}>
                Allow others to find and send you match requests
              </Text>
              {availableForMatches && matchStruggles.length > 0 && (
                <Text style={styles.strugglesPreview}>
                  {matchStruggles.slice(0, 3).join(', ')}
                  {matchStruggles.length > 3 && ` +${matchStruggles.length - 3} more`}
                </Text>
              )}
            </View>
            <View style={[styles.toggle, availableForMatches && styles.toggleActive]}>
              <View style={[styles.toggleThumb, availableForMatches && styles.toggleThumbActive]} />
            </View>
          </Pressable>
          
          <Pressable onPress={openBlockedAccounts} style={styles.blockedButton}>
            <Feather name="slash" size={20} color="#333" />
            <Text style={styles.blockedButtonText}>Blocked Accounts</Text>
            <Feather name="chevron-right" size={20} color="#9ca3af" />
          </Pressable>
          
          <Pressable onPress={handleLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Logout</Text>
          </Pressable>
        </View>

        {/* Save Button */}
        <Pressable onPress={handleSave} style={styles.saveButton} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.saveText}>Save Changes</Text>
          )}
        </Pressable>

        {/* Debug Info */}
        <View style={styles.debugSection}>
          <Text style={styles.debugTitle}>Debug Info</Text>
          <Text style={styles.debugText}>Display Name: {displayName || 'Not set'}</Text>
          <Text style={styles.debugText}>Anonymous Username: {anonymousUsername || 'Not set'}</Text>
          <Text style={styles.debugText}>Avatar URL: {avatarUrl ? 'Set' : 'Not set'}</Text>
          <Pressable onPress={loadUserProfile} style={styles.refreshButton}>
            <Text style={styles.refreshText}>Refresh Profile Data</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Struggles Selection Modal */}
      <Modal
        visible={showStrugglesModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowStrugglesModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowStrugglesModal(false)} style={styles.modalBackButton}>
              <Feather name="x" size={24} color="#333" />
            </Pressable>
            <Text style={styles.modalTitle}>Select Your Struggles</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView style={styles.modalContent} contentContainerStyle={styles.modalScrollContent}>
            <Text style={styles.modalDescription}>
              Select the struggles you're dealing with. This helps others find you for matching.
            </Text>
            <View style={styles.strugglesGrid}>
              {STRUGGLE_OPTIONS.map((struggle) => (
                <Pressable
                  key={struggle}
                  style={[
                    styles.struggleChip,
                    matchStruggles.includes(struggle) && styles.struggleChipSelected,
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (matchStruggles.includes(struggle)) {
                      setMatchStruggles(matchStruggles.filter(s => s !== struggle));
                    } else {
                      setMatchStruggles([...matchStruggles, struggle]);
                    }
                  }}
                >
                  <Text
                    style={[
                      styles.struggleChipText,
                      matchStruggles.includes(struggle) && styles.struggleChipTextSelected,
                    ]}
                  >
                    {struggle}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={[
                styles.saveStrugglesButton,
                matchStruggles.length === 0 && styles.saveStrugglesButtonDisabled,
              ]}
              onPress={async () => {
                if (matchStruggles.length > 0) {
                  setAvailableForMatches(true);
                  setShowStrugglesModal(false);
                  
                  // Save immediately to database
                  if (user) {
                    try {
                      const { error } = await supabase
                        .from('profiles')
                        .update({
                          available_for_matches: true,
                          match_struggles: matchStruggles,
                        })
                        .eq('id', user.id);

                      if (error) {
                        console.error('Error saving match availability:', error);
                        Alert.alert('Error', 'Failed to save. Please try again.');
                        setAvailableForMatches(false);
                      } else {
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        Alert.alert('Success', 'You\'re now available for matches!');
                      }
                    } catch (error) {
                      console.error('Error saving:', error);
                      Alert.alert('Error', 'Failed to save. Please try again.');
                      setAvailableForMatches(false);
                    }
                  }
                } else {
                  Alert.alert('Select Struggles', 'Please select at least one struggle.');
                }
              }}
              disabled={matchStruggles.length === 0}
            >
              <Text style={[
                styles.saveStrugglesButtonText,
                matchStruggles.length === 0 && styles.saveStrugglesButtonTextDisabled,
              ]}>
                Save & Enable
              </Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>

      {/* Blocked Accounts Modal */}
      <Modal
        visible={showBlockedAccounts}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowBlockedAccounts(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowBlockedAccounts(false)} style={styles.modalBackButton}>
              <Feather name="x" size={24} color="#333" />
            </Pressable>
            <Text style={styles.modalTitle}>Blocked Accounts</Text>
            <View style={styles.placeholder} />
          </View>

          {loadingBlocked ? (
            <View style={styles.modalLoading}>
              <ActivityIndicator size="large" color="#ec4899" />
            </View>
          ) : blockedAccounts.length === 0 ? (
            <View style={styles.modalEmpty}>
              <Feather name="slash" size={48} color="#d1d5db" />
              <Text style={styles.modalEmptyText}>No blocked accounts</Text>
              <Text style={styles.modalEmptySubtext}>You haven't blocked anyone yet</Text>
            </View>
          ) : (
            <FlatList
              data={blockedAccounts}
              keyExtractor={(item) => item.blocked_id}
              contentContainerStyle={styles.blockedList}
              renderItem={({ item }) => {
                const blockedUser = item.blocked;
                const displayName = blockedUser?.display_name || blockedUser?.anonymous_username || 'Anonymous';
                
                return (
                  <View style={styles.blockedItem}>
                    {blockedUser?.avatar_url ? (
                      <Image source={{ uri: blockedUser.avatar_url }} style={styles.blockedAvatar} />
                    ) : (
                      <View style={styles.blockedAvatarPlaceholder}>
                        <Text style={styles.blockedAvatarText}>
                          {displayName[0]?.toUpperCase() || '?'}
                        </Text>
                      </View>
                    )}
                    <View style={styles.blockedItemInfo}>
                      <Text style={styles.blockedItemName}>{displayName}</Text>
                      <Text style={styles.blockedItemDate}>
                        Blocked {new Date(item.blocked_at).toLocaleDateString()}
                      </Text>
                    </View>
                    <Pressable
                      style={styles.unblockButton}
                      onPress={() => handleUnblock(item.blocked_id, displayName)}
                    >
                      <Text style={styles.unblockButtonText}>Unblock</Text>
                    </Pressable>
                  </View>
                );
              }}
            />
          )}
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  scrollContent: {
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f8f8f8',
  },
  backIcon: {
    fontSize: 20,
    color: '#333',
    fontWeight: '700',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#333',
  },
  placeholder: {
    width: 36,
  },
  section: {
    backgroundColor: 'white',
    marginTop: 20,
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#f5f5f5',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 20,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 12,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ec4899',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ec4899',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  avatarText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 32,
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  changeAvatarButton: {
    backgroundColor: '#f8f8f8',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  changeAvatarText: {
    color: '#333',
    fontWeight: '600',
    fontSize: 14,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    height: 48,
    backgroundColor: '#f9fafb',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 16,
    color: '#111827',
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  usernameInput: {
    flex: 1,
    marginRight: 12,
  },
  generateButton: {
    backgroundColor: '#ec4899',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#ec4899',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  generateText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 14,
  },
  logoutButton: {
    backgroundColor: '#fee2e2',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  logoutText: {
    color: '#dc2626',
    fontWeight: '700',
    fontSize: 16,
  },
  saveButton: {
    backgroundColor: '#ec4899',
    marginHorizontal: 16,
    marginTop: 20,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#ec4899',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  saveText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 16,
  },
  debugSection: {
    backgroundColor: '#f8f9fa',
    marginHorizontal: 16,
    marginTop: 20,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
  },
  debugText: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  refreshButton: {
    backgroundColor: '#ec4899',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  refreshText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 12,
  },
  blockedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  blockedButtonText: {
    flex: 1,
    marginLeft: 12,
    color: '#333',
    fontWeight: '600',
    fontSize: 16,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  modalBackButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f8f8f8',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#333',
  },
  modalLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalEmpty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  modalEmptyText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#374151',
    marginTop: 16,
    marginBottom: 8,
  },
  modalEmptySubtext: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  blockedList: {
    paddingVertical: 8,
  },
  blockedItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  blockedAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  blockedAvatarPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#ec4899',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  blockedAvatarText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 20,
  },
  blockedItemInfo: {
    flex: 1,
  },
  blockedItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  blockedItemDate: {
    fontSize: 12,
    color: '#9ca3af',
  },
  unblockButton: {
    backgroundColor: '#fee2e2',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  unblockButtonText: {
    color: '#dc2626',
    fontWeight: '600',
    fontSize: 14,
  },
  premiumButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fdf2f8',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#fce7f3',
  },
  premiumButtonText: {
    flex: 1,
    marginLeft: 12,
    color: '#ec4899',
    fontWeight: '700',
    fontSize: 16,
  },
  premiumMemberButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#d1fae5',
  },
  settingToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    marginBottom: 12,
  },
  settingToggleContent: {
    flex: 1,
    marginRight: 12,
  },
  settingOptionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  settingOptionDescription: {
    fontSize: 12,
    color: '#6b7280',
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#e5e7eb',
    padding: 2,
    justifyContent: 'center',
  },
  toggleActive: {
    backgroundColor: '#ec4899',
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  toggleThumbActive: {
    transform: [{ translateX: 22 }],
  },
  strugglesPreview: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
    fontStyle: 'italic',
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  modalScrollContent: {
    paddingBottom: 40,
  },
  modalDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 24,
    lineHeight: 20,
  },
  strugglesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 32,
  },
  struggleChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e1e5e9',
  },
  struggleChipSelected: {
    backgroundColor: '#ec4899',
    borderColor: '#ec4899',
  },
  struggleChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  struggleChipTextSelected: {
    color: '#fff',
  },
  saveStrugglesButton: {
    backgroundColor: '#ec4899',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveStrugglesButtonDisabled: {
    opacity: 0.5,
  },
  saveStrugglesButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  saveStrugglesButtonTextDisabled: {
    opacity: 0.7,
  },
  premiumMemberText: {
    flex: 1,
    marginLeft: 12,
    color: '#10b981',
    fontWeight: '700',
    fontSize: 16,
  },
});
