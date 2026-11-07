import { computed, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useActingStore } from '../stores/acting';

export interface UseActingMode {
    isActing: ComputedRef<boolean>;
    label: ComputedRef<string>;
}

export function useActingMode(): UseActingMode {
    const { t } = useI18n();
    const acting = useActingStore();

    const label = computed(() => {
        const manager = acting.session?.administratorName;
        return manager ? t('acting.line', { manager }) : t('acting.lineUnknown');
    });

    return { isActing: computed(() => acting.isActing), label };
}
