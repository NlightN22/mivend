import { computed, type Ref } from 'vue';
import { i18n } from '../i18n';
import type { AppSidebarItem, AppMobileNavItem, AppMobileSheetItem } from '@mivend/ui-kit';
import { useAuthStore } from '../stores/auth';
import { CHANGE_JOURNAL_LABELS } from '../components/change-journal/changeJournalLabels';
import { canOpenBulkOperations } from '../components/bulk-operations/operationUi';
import { systemSettingsPath } from '../components/layout/userMenuItems';

// Navigation entries of the default layout, gated by the same permissions as the pages they open.
export function useNavItems(approvalsBadgeCount: Ref<number>) {
    const t = (key: string): string => i18n.global.t(key);
    const authStore = useAuthStore();

    // Order per docs/manager-portal-ui-concept.md; Analytics routes to the shared "coming soon" page.
    const menuItems = computed<AppSidebarItem[]>(() => {
        // Proforma invoices are gated on the same permissions as their visible* queries.
        const documents: AppSidebarItem[] = [{ label: t('shell.nav.orders'), path: '/orders' }];
        if (authStore.hasPermission('ReadProformaInvoice'))
            documents.push({ label: t('shell.nav.proformaInvoices'), path: '/proforma-invoices' });
        documents.push({ label: t('shell.nav.discounts'), path: '/discounts' });
        // Settlements are gated like their visibleSettlementDocuments query.
        const settlements: AppSidebarItem[] = authStore.hasPermission('ReadSettlementDocument')
            ? [{ label: t('shell.nav.settlements'), path: '/settlements' }]
            : [];
        const items: AppSidebarItem[] = [
            { label: t('shell.nav.dashboard'), path: '/' },
            { label: t('shell.nav.customers'), path: '/customers' },
            { label: t('shell.nav.documents'), children: documents },
            ...settlements,
            {
                label: t('shell.nav.approvals'),
                path: '/approvals',
                badgeCount: approvalsBadgeCount.value,
            },
            { label: t('shell.nav.team'), path: '/team' },
        ];
        if (canOpenBulkOperations(authStore.hasPermission)) {
            items.push({ label: t('shell.nav.bulkOperations'), path: '/bulk-operations' });
        }
        items.push({ label: t('shell.nav.analytics'), path: '/analytics' });
        if (authStore.hasPermission('ReadChangeJournal'))
            items.push({ label: CHANGE_JOURNAL_LABELS.pageTitle, path: '/change-journal' });
        // Permission-gated (ManageAccessControl), not a role allowlist: granting it in Vendure admin
        // needs no manager-portal code change.
        const settingsPath = systemSettingsPath(authStore.hasPermission);
        if (settingsPath) items.push({ label: t('shell.nav.systemSettings'), path: settingsPath });
        return items;
    });

    // Must be computed, not a plain array: the async onMounted badge update would never reach
    // the rendered badge (a literal freezes badgeCount at first script setup).
    const mobileNavItems = computed<AppMobileNavItem[]>(() => [
        { key: 'dashboard', label: t('shell.nav.dashboard'), path: '/', icon: 'home' },
        {
            key: 'customers',
            label: t('shell.nav.customers'),
            path: '/customers',
            icon: 'customers',
        },
        { key: 'orders', label: t('shell.nav.orders'), path: '/orders', icon: 'orders' },
        {
            key: 'approvals',
            label: t('shell.nav.approvals'),
            path: '/approvals',
            icon: 'approvals',
            badgeCount: approvalsBadgeCount.value,
        },
        { key: 'more', label: t('shell.nav.more'), icon: 'more' },
    ]);

    // Same permission gates as the desktop sidebar (menuItems) — the sheet must never offer a
    // route the current admin's permissions would just have the underlying query/mutation reject.
    const moreSheetItems = computed<AppMobileSheetItem[]>(() => {
        const items: AppMobileSheetItem[] = [];
        if (authStore.hasPermission('ReadProformaInvoice'))
            items.push({
                key: 'proformaInvoices',
                label: t('shell.nav.proformaInvoices'),
                path: '/proforma-invoices',
            });
        items.push({ key: 'discounts', label: t('shell.nav.discounts'), path: '/discounts' });
        if (authStore.hasPermission('ReadSettlementDocument'))
            items.push({
                key: 'settlements',
                label: t('shell.nav.settlements'),
                path: '/settlements',
            });
        items.push(
            { key: 'team', label: t('shell.nav.team'), path: '/team' },
            { key: 'analytics', label: t('shell.nav.analytics'), path: '/analytics' },
        );
        if (authStore.hasPermission('ReadChangeJournal'))
            items.push({
                key: 'changeJournal',
                label: CHANGE_JOURNAL_LABELS.pageTitle,
                path: '/change-journal',
            });
        const settingsPath = systemSettingsPath(authStore.hasPermission);
        if (settingsPath)
            items.push({
                key: 'settings',
                label: t('shell.nav.systemSettings'),
                path: settingsPath,
            });
        return items;
    });

    return { menuItems, mobileNavItems, moreSheetItems };
}
