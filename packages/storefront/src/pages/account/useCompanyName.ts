import { computed, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth';

export function useCompanyName(): {
    companyName: ComputedRef<string>;
    initials: ComputedRef<string>;
} {
    const authStore = useAuthStore();
    const { t } = useI18n();
    const fullName = computed(() => authStore.counterparty?.fullName?.trim() || null);
    const companyName = computed(() => fullName.value ?? t('account.companyNameUnknown'));
    const initials = computed(() => fullName.value?.slice(0, 2).toUpperCase() || '?');
    return { companyName, initials };
}
