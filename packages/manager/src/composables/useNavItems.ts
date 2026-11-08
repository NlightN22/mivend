import { computed, type Ref } from 'vue';
import type { AppSidebarItem, AppMobileNavItem, AppMobileSheetItem } from '@mivend/ui-kit';
import { useAuthStore } from '../stores/auth';
import { canOpenBulkOperations } from '../components/bulk-operations/operationUi';

// Navigation entries of the default layout, gated by the same permissions as the pages they open.
export function useNavItems(approvalsBadgeCount: Ref<number>) {
    const authStore = useAuthStore();

    // Order per docs/manager-portal-ui-concept.md; Analytics routes to the shared "coming soon" page.
    const menuItems = computed<AppSidebarItem[]>(() => {
        // Proforma invoices/Payments are gated on the same permissions as their visible* queries.
        const documents: AppSidebarItem[] = [{ label: 'Orders', path: '/orders' }];
        if (authStore.hasPermission('ReadProformaInvoice'))
            documents.push({ label: 'Proforma invoices', path: '/proforma-invoices' });
        if (authStore.hasPermission('ReadPayment'))
            documents.push({ label: 'Payments', path: '/payments' });
        documents.push({ label: 'Discount requests', path: '/discounts' });
        // Settlements are gated like their visibleSettlementDocuments query.
        const settlements: AppSidebarItem[] = authStore.hasPermission('ReadSettlementDocument')
            ? [{ label: 'Settlements', path: '/settlements' }]
            : [];
        const items: AppSidebarItem[] = [
            { label: 'Dashboard', path: '/' },
            { label: 'Customers', path: '/customers' },
            { label: 'Documents', children: documents },
            ...settlements,
            { label: 'Approvals', path: '/approvals', badgeCount: approvalsBadgeCount.value },
            { label: 'Team', path: '/team' },
        ];
        if (canOpenBulkOperations(authStore.hasPermission)) {
            items.push({ label: 'Bulk operations', path: '/bulk-operations' });
        }
        items.push({ label: 'Analytics', path: '/analytics' });
        // Gated on the same ManageAccessControl permission the Settings > Roles & Access page
        // itself checks — not a role-code allowlist, so granting/revoking this via the native
        // Vendure admin UI (any role) is enough, no manager-portal code change needed.
        if (authStore.hasPermission('ManageAccessControl')) {
            items.push({ label: 'Settings', path: '/settings' });
        } else if (authStore.hasPermission('ManageVisibilityGrants')) {
            items.push({ label: 'Settings', path: '/settings/visibility-grants' });
        }
        return items;
    });

    // The 5 items that fit the mobile bottom bar — everything else lives in the "More" sheet.
    // Computed (not a plain array) so approvalsBadgeCount's async onMounted update actually reaches
    // the rendered badge — a plain array literal would freeze badgeCount at its value when this
    // component's <script setup> first ran, before the fetch below ever resolves.
    const mobileNavItems = computed<AppMobileNavItem[]>(() => [
        { key: 'dashboard', label: 'Dashboard', path: '/', icon: 'home' },
        { key: 'customers', label: 'Customers', path: '/customers', icon: 'customers' },
        { key: 'orders', label: 'Orders', path: '/orders', icon: 'orders' },
        {
            key: 'approvals',
            label: 'Approvals',
            path: '/approvals',
            icon: 'approvals',
            badgeCount: approvalsBadgeCount.value,
        },
        { key: 'more', label: 'More', icon: 'more' },
    ]);

    // Same permission gates as the desktop sidebar (menuItems) — the sheet must never offer a
    // route the current admin's permissions would just have the underlying query/mutation reject.
    const moreSheetItems = computed<AppMobileSheetItem[]>(() => {
        const items: AppMobileSheetItem[] = [];
        if (authStore.hasPermission('ReadProformaInvoice'))
            items.push({
                key: 'proformaInvoices',
                label: 'Proforma invoices',
                path: '/proforma-invoices',
            });
        if (authStore.hasPermission('ReadPayment'))
            items.push({ key: 'payments', label: 'Payments', path: '/payments' });
        items.push({ key: 'discounts', label: 'Discount requests', path: '/discounts' });
        if (authStore.hasPermission('ReadSettlementDocument'))
            items.push({ key: 'settlements', label: 'Settlements', path: '/settlements' });
        items.push(
            { key: 'team', label: 'Team', path: '/team' },
            { key: 'analytics', label: 'Analytics', path: '/analytics' },
        );
        if (authStore.hasPermission('ManageAccessControl')) {
            items.push({ key: 'settings', label: 'Settings', path: '/settings' });
        } else if (authStore.hasPermission('ManageVisibilityGrants')) {
            items.push({ key: 'settings', label: 'Settings', path: '/settings/visibility-grants' });
        }
        return items;
    });

    return { menuItems, mobileNavItems, moreSheetItems };
}
