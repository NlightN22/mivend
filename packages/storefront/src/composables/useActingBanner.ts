import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useActingStore } from '../stores/acting';
import { useAuthStore } from '../stores/auth';
import { readManagerUrl } from '../utils/managerUrl';

export interface UseActingBanner {
    visible: ComputedRef<boolean>;
    label: ComputedRef<string>;
    finishing: Ref<boolean>;
    finish: () => Promise<void>;
}

export function useActingBanner(): UseActingBanner {
    const { t } = useI18n();
    const acting = useActingStore();
    const auth = useAuthStore();
    const finishing = ref(false);

    const label = computed(() => {
        const customer = auth.counterparty?.fullName;
        return customer ? t('acting.banner', { customer }) : t('acting.bannerUnknown');
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

    return { visible: computed(() => acting.isActing), label, finishing, finish };
}
