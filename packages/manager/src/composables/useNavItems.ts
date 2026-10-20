import { computed, type Ref } from 'vue';
import type { AppSidebarItem, AppMobileNavItem, AppMobileSheetItem } from '@mivend/ui-kit';
import { useAuthStore } from '../stores/auth';

// Navigation entries of the default layout, gated by the same permissions as the pages they open.
export function useNavItems(approvalsBadgeCount: Ref<number>) {
    const authStore = useAuthStore();

    // Full menu per docs/ai/manager-portal-pages/00-shared-conventions.md — only Dashboard has a
    // real page so far, the rest route to a shared "coming soon" placeholder (see router/index.ts)
    // until they're built out one at a time.
    const menuItems = computed<AppSidebarItem[]>(() => {
        const items: AppSidebarItem[] = [
            { label: 'Dashboard', path: '/' },
            { label: 'Orders', path: '/orders' },
        ];
        // Gated on the same CustomPermission.ReadProformaInvoice/ReadPayment the visibleProformaInvoices/
        // visiblePayments queries themselves check — see AdminProformaInvoiceVisibilityResolver/
        // AdminPaymentVisibilityResolver.
        if (authStore.hasPermission('ReadProformaInvoice'))
            items.push({ label: 'Proforma invoices', path: '/proforma-invoices' });
        if (authStore.hasPermission('ReadPayment'))
            items.push({ label: 'Payments', path: '/payments' });
        items.push(
            { label: 'Customers', path: '/customers' },
            { label: 'Catalog', path: '/catalog' },
            { label: 'Discounts', path: '/discounts' },
            { label: 'Approvals', path: '/approvals', badgeCount: approvalsBadgeCount.value },
            { label: 'Team', path: '/team' },
        );
        // Issue #120 — gated on ManageCounterpartyPortalAccess, the new permission covering both
        // this bulk-activation page and the Counterparty detail page's Portal Users tab.
        if (authStore.hasPermission('ManageCounterpartyPortalAccess')) {
            items.push({ label: 'Обработки', path: '/bulk-operations/counterparty-activation' });
        }
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
        items.push(
            { key: 'catalog', label: 'Catalog', path: '/catalog' },
            { key: 'discounts', label: 'Discounts', path: '/discounts' },
            { key: 'team', label: 'Team', path: '/team' },
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
