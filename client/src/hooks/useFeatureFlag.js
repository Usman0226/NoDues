import { useQuery } from '@tanstack/react-query';
import { getWizardStatus } from '../api/wizard';

/**
 * Hook to retrieve feature flag status for the setup wizard.
 * Cached for 10 seconds to respect FR-F5 (TTL <= 10s).
 */
export const useSetupWizardFlag = () => {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['featureFlag', 'setup_wizard_enabled'],
    queryFn: async () => {
      try {
        const res = await getWizardStatus();
        const flagVal = res?.data?.enabled ?? res?.enabled;
        return flagVal !== undefined ? Boolean(flagVal) : true;
      } catch {
        // Safe default: enabled for administrators/staff
        return true;
      }
    },
    staleTime: 5000,
    refetchInterval: 10000,
  });

  return {
    isEnabled: data !== undefined ? Boolean(data) : true,
    isLoading,
    isError,
    refetch,
  };
};

