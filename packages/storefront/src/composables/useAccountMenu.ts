import { computed, type ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AccountMenuEntry } from '@mivend/ui-kit';
import { useAuthStore } from '../stores/auth';
import { useCompanyName } from '../pages/account/useCompanyName';
import { useDemoMode } from './useDemoMode';
import { buildAccountMenu } from './accountMenuItems';

export function useAccountMenu(exclude: string[]): {
    entries: ComputedRef<AccountMenuEntry[]>;
    userName: ComputedRef<string>;
    userRole: ComputedRef<string>;
    userInitials: ComputedRef<string>;
} {
    const { t, te } = useI18n();
    const authStore = useAuthStore();
    const { demoAllowed } = useDemoMode();
    const { companyName, initials } = useCompanyName();
    const label = (key: string): string => t(`accountNav.${key}`);

    const entries = computed<AccountMenuEntry[]>(() =>
        buildAccountMenu(demoAllowed, exclude).map(node => ({
            key: node.key,
            label: label(node.key),
            to: node.to,
            children: node.children?.map(c => ({ ...c, label: label(c.key) })),
        })),
    );
    const userRole = computed(() => {
        const code = authStore.customer?.customFields?.portalRole;
        if (!code) return '';
        const key = `account.portalRole.${code}`;
        return te(key) ? t(key) : code;
    });

    return { entries, userName: companyName, userRole, userInitials: initials };
}
