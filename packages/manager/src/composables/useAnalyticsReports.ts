import { onMounted, ref, type Ref } from 'vue';
import { fetchAnalyticsReports, type AnalyticsReportInfo } from '../api/analytics';

export interface UseAnalyticsReports {
    reports: Ref<AnalyticsReportInfo[]>;
    loading: Ref<boolean>;
    failed: Ref<boolean>;
    load: () => Promise<void>;
}

export function useAnalyticsReports(): UseAnalyticsReports {
    const reports = ref<AnalyticsReportInfo[]>([]);
    const loading = ref(true);
    const failed = ref(false);

    async function load(): Promise<void> {
        loading.value = true;
        failed.value = false;
        try {
            reports.value = await fetchAnalyticsReports();
        } catch {
            failed.value = true;
        } finally {
            loading.value = false;
        }
    }
    onMounted(() => void load());
    return { reports, loading, failed, load };
}
