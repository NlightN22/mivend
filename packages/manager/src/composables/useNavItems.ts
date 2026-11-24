import { computed, ComputedRef, type Ref } from 'vue';
import { i18n } from '../i18n';
import type { AppSidebarItem, AppMobileNavItem, AppMobileSheetItem } from '@mivend/ui-kit';
import {
    ERP_DOCUMENT_KINDS,
    ERP_DOCUMENT_PATHS,
    POWER_OF_ATTORNEY_PATH,
} from '../api/erpDocumentKinds';
import { useAuthStore } from '../stores/auth';
import { CHANGE_JOURNAL_LABELS } from '../components/change-journal/changeJournalLabels';
import { canOpenBulkOperations } from '../components/bulk-operations/operationUi';
import { systemSettingsPath } from '../components/layout/userMenuItems';

// Navigation entries of the default layout, gated by the same permissions as the pages they open.
export interface UseNavItems {
    menuItems: ComputedRef<AppSidebarItem[]>;
    mobileNavItems: ComputedRef<AppMobileNavItem[]>;
    moreSheetItems: ComputedRef<AppMobileSheetItem[]>;
}

export function useNavItems(approvalsBadgeCount: Ref<number>): UseNavItems {
    const t = (key: string): string => i18n.global.t(key);
    const authStore = useAuthStore();

    // Order per docs/manager-portal-ui-concept.md.
    const menuItems = computed<AppSidebarItem[]>(() => {
        // Proforma invoices are gated on the same permissions as their visible* queries.
        const sales = authStore.hasPermission('ReadOrder');
        const documents: AppSidebarItem[] = sales
            ? [{ label: t('shell.nav.orders'), path: '/orders' }]
            : [];
        if (authStore.hasPermission('ReadProformaInvoice'))
            documents.push({ label: t('shell.nav.proformaInvoices'), path: '/proforma-invoices' });
        if (sales) documents.push({ label: t('shell.nav.discounts'), path: '/discounts' });
        // The ERP document lists are gated like their visible* queries (the order right).
        if (authStore.hasPermission('ReadOrder'))
            for (const kind of ERP_DOCUMENT_KINDS)
                documents.push({
                    label: t(`erpDocuments.${kind}.title`),
                    path: ERP_DOCUMENT_PATHS[kind],
                });
        if (authStore.hasPermission('ReadCounterparty'))
            documents.push({
                label: t('erpDocuments.powerOfAttorney.title'),
                path: POWER_OF_ATTORNEY_PATH,
            });
        // Settlements are gated like their visibleSettlementDocuments query.
        const settlements: AppSidebarItem[] = authStore.hasPermission('ReadSettlementDocument')
            ? [{ label: t('shell.nav.settlements'), path: '/settlements' }]
            : [];
        const items: AppSidebarItem[] = [
            { label: t('shell.nav.dashboard'), path: '/' },
            ...(authStore.hasPermission('ReadCustomer')
                ? [{ label: t('shell.nav.customers'), path: '/customers' }]
                : []),
            ...(documents.length ? [{ label: t('shell.nav.documents'), children: documents }] : []),
            ...settlements,
            ...(sales
                ? [
                      {
                          label: t('shell.nav.approvals'),
                          path: '/approvals',
                          badgeCount: approvalsBadgeCount.value,
                      },
                      { label: t('shell.nav.team'), path: '/team' },
                  ]
                : []),
        ];
        if (canOpenBulkOperations(authStore.hasPermission)) {
            items.push({ label: t('shell.nav.bulkOperations'), path: '/bulk-operations' });
        }
        if (authStore.hasPermission('ReadAnalytics'))
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
    const mobileNavItems = computed<AppMobileNavItem[]>(() => {
        const sales = authStore.hasPermission('ReadOrder');
        const items: AppMobileNavItem[] = [
            { key: 'dashboard', label: t('shell.nav.dashboard'), path: '/', icon: 'home' },
        ];
        if (authStore.hasPermission('ReadCustomer'))
            items.push({
                key: 'customers',
                label: t('shell.nav.customers'),
                path: '/customers',
                icon: 'customers',
            });
        if (sales)
            items.push(
                { key: 'orders', label: t('shell.nav.orders'), path: '/orders', icon: 'orders' },
                {
                    key: 'approvals',
                    label: t('shell.nav.approvals'),
                    path: '/approvals',
                    icon: 'approvals',
                    badgeCount: approvalsBadgeCount.value,
                },
            );
        items.push({ key: 'more', label: t('shell.nav.more'), icon: 'more' });
        return items;
    });

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
        if (authStore.hasPermission('ReadOrder'))
            items.push({ key: 'discounts', label: t('shell.nav.discounts'), path: '/discounts' });
        if (authStore.hasPermission('ReadOrder'))
            for (const kind of ERP_DOCUMENT_KINDS)
                items.push({
                    key: kind,
                    label: t(`erpDocuments.${kind}.title`),
                    path: ERP_DOCUMENT_PATHS[kind],
                });
        if (authStore.hasPermission('ReadCounterparty'))
            items.push({
                key: 'powerOfAttorney',
                label: t('erpDocuments.powerOfAttorney.title'),
                path: POWER_OF_ATTORNEY_PATH,
            });
        if (authStore.hasPermission('ReadSettlementDocument'))
            items.push({
                key: 'settlements',
                label: t('shell.nav.settlements'),
                path: '/settlements',
            });
        if (authStore.hasPermission('ReadOrder'))
            items.push({ key: 'team', label: t('shell.nav.team'), path: '/team' });
        if (authStore.hasPermission('ReadAnalytics'))
            items.push({ key: 'analytics', label: t('shell.nav.analytics'), path: '/analytics' });
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
