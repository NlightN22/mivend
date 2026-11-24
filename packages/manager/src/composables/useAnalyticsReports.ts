import { computed, onMounted, ref, type Ref } from 'vue';
import { fetchAnalyticsReports, localizeReport, type AnalyticsReportInfo } from '../api/analytics';

export interface UseAnalyticsReports {
    reports: Ref<AnalyticsReportInfo[]>;
    loading: Ref<boolean>;
    failed: Ref<boolean>;
    load: () => Promise<void>;
}

export function useAnalyticsReports(): UseAnalyticsReports {
    const loaded = ref<AnalyticsReportInfo[]>([]);
    // Translated on read, so the catalog follows a language switch without a reload.
    const reports = computed(() => loaded.value.map(localizeReport));
    const loading = ref(true);
    const failed = ref(false);

    async function load(): Promise<void> {
        loading.value = true;
        failed.value = false;
        try {
            loaded.value = await fetchAnalyticsReports();
        } catch {
            failed.value = true;
        } finally {
            loading.value = false;
        }
    }
    onMounted(() => void load());
    return { reports, loading, failed, load };
}
