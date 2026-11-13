import { computed, ref } from 'vue';
import type { NotificationItem } from '@mivend/ui-kit';
import { useAuthStore } from '../stores/auth';
import { useBlockLoad } from './useBlockLoad';
import { fetchDashboardData, type DashboardData, type DashboardLoadResult } from '../api/dashboard';
import { fetchExpiringDiscountGrants } from '../api/discounts';
import {
    fetchFailedIntegrationInboxEvents,
    type FailedIntegrationInboxEvent,
} from '../api/integration-health';
import { fetchNotifications } from '../api/notifications';
import { fetchDepartments } from '../api/team';
import type { ExpiringDiscount } from '../components/dashboard/ExpiringDiscountsBanner.vue';

// Small, fixed row cap for dashboard attention panels: "is anything on fire" widgets, not paginated lists.
const HEALTH_PANEL_TAKE = 10;

// Same placeholder threshold used on /discounts (no exact "expiring soon" window has been decided).
const EXPIRING_SOON_DAYS = 14;

// The department badge is cosmetic: without it nothing misleading is shown, so its failure stays quiet.
function optional<T>(label: string, load: () => Promise<T>, fallback: T): Promise<T> {
    return load().catch(error => {
        console.warn(`[dashboard] could not load ${label}:`, error);
        return fallback;
    });
}

export function useDashboard() {
    const authStore = useAuthStore();
    const data = ref<DashboardData | null>(null);
    const failedSections = ref<DashboardLoadResult['failed']>({});
    const departmentName = ref<string | null>(null);
    const grants = useBlockLoad(() => fetchExpiringDiscountGrants(EXPIRING_SOON_DAYS));
    const inboxEvents = useBlockLoad(() => fetchFailedIntegrationInboxEvents(HEALTH_PANEL_TAKE));
    const notifications = useBlockLoad(() =>
        fetchNotifications({ status: 'unread' }).then(page => page.items),
    );
    const loading = ref(true);

    // One grant can list several customers: the banner shows one line per customer.
    const expiringDiscounts = computed<ExpiringDiscount[]>(() =>
        (grants.data.value?.items ?? []).flatMap(grant =>
            grant.counterparties.map(cp => ({
                id: `${grant.id}-${cp.id}`,
                customerName: cp.legalName,
                validTo: grant.validTo,
            })),
        ),
    );
    const failedInboxEvents = computed<FailedIntegrationInboxEvent[]>(
        () => inboxEvents.data.value ?? [],
    );
    const issuesOf = (sourceType: string): NotificationItem[] =>
        (notifications.data.value ?? [])
            .filter(n => n.sourceType === sourceType)
            .slice(0, HEALTH_PANEL_TAKE);
    const reservationIssues = computed(() => issuesOf('reservation-reconciliation'));
    const paymentIssues = computed(() => issuesOf('payment-reconciliation'));

    async function loadDepartmentName(): Promise<void> {
        const departmentId = authStore.administrator?.customFields.departmentId;
        const departments = await fetchDepartments();
        // administrator.customFields.departmentId stores the ERP id, not Department's DB row id.
        departmentName.value = departments.find(d => d.erpId === departmentId)?.name ?? null;
    }

    async function load(): Promise<void> {
        loading.value = true;
        try {
            const wantsReconciliationPanels =
                authStore.hasPermission('ReadOrder') || authStore.hasPermission('ReadPayment');
            const [dashboard] = await Promise.all([
                fetchDashboardData(),
                grants.load(),
                authStore.hasPermission('ManageAccessControl') ? inboxEvents.load() : undefined,
                // Both reconciliation panels read one generic unread-notifications query, split by sourceType.
                wantsReconciliationPanels ? notifications.load() : undefined,
            ]);
            data.value = dashboard.data;
            failedSections.value = dashboard.failed;
            await optional('department name', loadDepartmentName, undefined);
        } finally {
            loading.value = false;
        }
    }

    return {
        data,
        failedSections,
        departmentName,
        expiringDiscounts,
        failedInboxEvents,
        reservationIssues,
        paymentIssues,
        grantsError: grants.error,
        inboxError: inboxEvents.error,
        notificationsError: notifications.error,
        loading,
        load,
    };
}
