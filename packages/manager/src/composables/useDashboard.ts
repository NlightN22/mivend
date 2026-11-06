import { ref } from 'vue';
import type { NotificationItem } from '@mivend/ui-kit';
import { useAuthStore } from '../stores/auth';
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

// Every secondary source is caught on its own so one failure never blanks the main dashboard data.
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
    const expiringDiscounts = ref<ExpiringDiscount[]>([]);
    const failedInboxEvents = ref<FailedIntegrationInboxEvent[]>([]);
    const reservationIssues = ref<NotificationItem[]>([]);
    const paymentIssues = ref<NotificationItem[]>([]);
    const loading = ref(true);

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
            const [dashboard, grants, failedEvents, unreadNotifications] = await Promise.all([
                fetchDashboardData(),
                optional(
                    'expiring discount grants',
                    () => fetchExpiringDiscountGrants(EXPIRING_SOON_DAYS),
                    [],
                ),
                authStore.hasPermission('ManageAccessControl')
                    ? optional(
                          'failed integration inbox events',
                          () => fetchFailedIntegrationInboxEvents(HEALTH_PANEL_TAKE),
                          [],
                      )
                    : Promise.resolve([]),
                // Both reconciliation panels read one generic unread-notifications query, split by sourceType.
                wantsReconciliationPanels
                    ? optional(
                          'notifications',
                          () => fetchNotifications({ status: 'unread' }).then(page => page.items),
                          [] as NotificationItem[],
                      )
                    : Promise.resolve([] as NotificationItem[]),
            ]);
            data.value = dashboard.data;
            failedSections.value = dashboard.failed;
            failedInboxEvents.value = failedEvents;
            reservationIssues.value = unreadNotifications
                .filter(n => n.sourceType === 'reservation-reconciliation')
                .slice(0, HEALTH_PANEL_TAKE);
            paymentIssues.value = unreadNotifications
                .filter(n => n.sourceType === 'payment-reconciliation')
                .slice(0, HEALTH_PANEL_TAKE);
            // One grant can list several customers: the banner shows one line per customer.
            expiringDiscounts.value = grants.flatMap(grant =>
                grant.counterparties.map(cp => ({
                    id: `${grant.id}-${cp.id}`,
                    customerName: cp.legalName,
                    validTo: grant.validTo,
                })),
            );
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
        loading,
        load,
    };
}
