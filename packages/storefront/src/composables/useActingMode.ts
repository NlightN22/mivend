import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useActingStore } from '../stores/acting';
import { readManagerUrl } from '../utils/managerUrl';

export interface UseActingMode {
    isActing: ComputedRef<boolean>;
    label: ComputedRef<string>;
    finishing: Ref<boolean>;
    finish: () => Promise<void>;
}

export function useActingMode(): UseActingMode {
    const { t } = useI18n();
    const acting = useActingStore();
    const finishing = ref(false);

    const label = computed(() => {
        const manager = acting.session?.administratorName;
        return manager ? t('acting.line', { manager }) : t('acting.lineUnknown');
    });

    async function finish(): Promise<void> {
        finishing.value = true;
        try {
            await acting.finish();
        } catch {
            // the local token is already cleared by the store
        }
        window.close();
        window.location.replace(readManagerUrl() ?? '/login');
    }

    return { isActing: computed(() => acting.isActing), label, finishing, finish };
}
