import { ResourcesLibraryScreen } from '@/components/learning/ResourcesLibraryScreen';
import {
  listResourcesForTherapistLibrary,
  TherapistResource,
} from '@/app/therapist/_marketplace';
import { auth } from '@/lib/firebase';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { tokens } from '@/app/ui/tokens';

const THERAPIST_EMPTY_HINTS = {
  video: 'Your admin will add videos here.',
  book: 'Your admin will add books here.',
  article: 'Your admin will add articles here.',
};

export default function TherapistResourcesScreen() {
  const router = useRouter();
  const uid = auth.currentUser?.uid ?? null;

  return (
    <ResourcesLibraryScreen
      subtitle="Videos, books & articles to deepen your practice"
      fetchResources={() => listResourcesForTherapistLibrary(uid || '', 200)}
      headerTrailing={
        <Pressable
          onPress={() => router.push('/therapist/resource-edit')}
          style={styles.addBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Add resource"
        >
          <Feather name="plus" size={20} color={tokens.colors.pink} />
        </Pressable>
      }
      emptySectionHints={THERAPIST_EMPTY_HINTS}
      manageUid={uid}
      onEditOwnResource={(item: TherapistResource) =>
        router.push({ pathname: '/therapist/resource-edit', params: { id: item.id } })
      }
    />
  );
}

const styles = StyleSheet.create({
  addBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(244,114,182,0.12)',
  },
});
