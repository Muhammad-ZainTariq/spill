import { listResourcesForUserApp } from '@/app/therapist/_marketplace';
import { ResourcesLibraryScreen } from '@/components/learning/ResourcesLibraryScreen';
import { useCallback } from 'react';

export default function ResourcesScreen() {
  const fetchResources = useCallback(() => listResourcesForUserApp(200), []);

  return (
    <ResourcesLibraryScreen
      subtitle="Videos, books & articles for your wellbeing"
      fetchResources={fetchResources}
    />
  );
}
