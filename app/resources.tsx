import { listResourcesForUserApp } from '@/app/therapist/_marketplace';
import { ResourcesLibraryScreen } from '@/app/components/learning/ResourcesLibraryScreen';

export default function ResourcesScreen() {
  return (
    <ResourcesLibraryScreen
      subtitle="Videos, books & articles for your wellbeing"
      fetchResources={() => listResourcesForUserApp(200)}
    />
  );
}
