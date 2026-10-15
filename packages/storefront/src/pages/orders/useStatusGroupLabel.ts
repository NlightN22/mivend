import { computed, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useOrderStatusesStore } from '../../stores/orderStatuses';

export function useStatusGroupLabel(code: () => string | null | undefined): ComputedRef<string> {
    const { t, te } = useI18n();
    const statuses = useOrderStatusesStore();
    return computed(() => {
        const key = `orders.groupLabels.${statuses.groupOf(code())}`;
        return te(key) ? t(key) : statuses.label(code());
    });
}
