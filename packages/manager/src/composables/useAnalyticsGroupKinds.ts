import { onMounted, ref, type Ref } from 'vue';
import { fetchAnalyticsGroupKinds } from '../api/analyticsGroups';
import type { OrderAnalyticsGroupKind } from '../api/generated/graphql';

export function useAnalyticsGroupKinds(): Ref<OrderAnalyticsGroupKind[]> {
    const kinds = ref<OrderAnalyticsGroupKind[]>([]);
    onMounted(async () => {
        kinds.value = await fetchAnalyticsGroupKinds();
    });
    return kinds;
}
