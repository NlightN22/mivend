<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { MvNotice, useLatestRequest, MvFilterChips, type FilterChip } from '@mivend/ui-kit';
import type { NotificationItem } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { useNotificationsStore } from '../../stores/notifications';
import { useUrlSyncedState } from '../../composables/useUrlSyncedState';
import NotificationsDataTable from '../../components/notifications/NotificationsDataTable.vue';
import {
    fetchNotifications,
    fetchNotificationViewCounts,
    markNotificationRead,
    resolveNotification,
    NOTIFICATION_STATUS_BADGE_VARIANT,
    type NotificationViewCounts,
} from '../../api/notifications';

const authStore = useAuthStore();

const pageSize = ref(20);
const page = ref(1);
const totalItems = ref(0);
const notifications = ref<NotificationItem[]>([]);

type ViewKey = 'all' | 'unread' | 'read' | 'resolved';
const VIEWS: { key: ViewKey; label: string; variant?: FilterChip['variant'] }[] = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread', variant: NOTIFICATION_STATUS_BADGE_VARIANT.unread },
    { key: 'read', label: 'Read', variant: NOTIFICATION_STATUS_BADGE_VARIANT.read },
    { key: 'resolved', label: 'Resolved', variant: NOTIFICATION_STATUS_BADGE_VARIANT.resolved },
];
const viewCounts = ref<NotificationViewCounts>({ all: 0, unread: 0, read: 0, resolved: 0 });
const viewChips = computed<FilterChip[]>(() =>
    VIEWS.map(v => ({ key: v.key, label: `${v.label} ${viewCounts.value[v.key]}`, variant: v.variant })),
);

const statusFilter = ref('');
const searchFilter = ref('');
const activeView = computed<ViewKey>({
    get: () => (statusFilter.value || 'all') as ViewKey,
    set: view => {
        statusFilter.value = view === 'all' ? '' : view;
    },
});

interface NotificationUrlFilters {
    [key: string]: string;
    status: string;
    search: string;
    pageSize: string;
}
const URL_FILTER_DEFAULTS: NotificationUrlFilters = { status: '', search: '', pageSize: '20' };
const { fromQuery, toQuery } = useUrlSyncedState(URL_FILTER_DEFAULTS);

{
    const parsed = { ...URL_FILTER_DEFAULTS };
    fromQuery(parsed, page);
    if (parsed.status) statusFilter.value = parsed.status;
    if (parsed.search) searchFilter.value = parsed.search;
    if (parsed.pageSize) pageSize.value = Number(parsed.pageSize);
}

function buildUrlFilters(): NotificationUrlFilters {
    return { status: statusFilter.value, search: searchFilter.value, pageSize: String(pageSize.value) };
}

const { loading, run: load } = useLatestRequest(
    () =>
        fetchNotifications({
            status: statusFilter.value ? (statusFilter.value as 'unread' | 'read' | 'resolved') : undefined,
            search: searchFilter.value || undefined,
            take: pageSize.value,
            skip: (page.value - 1) * pageSize.value,
        }),
    result => {
        notifications.value = result.items;
        totalItems.value = result.totalItems;
    },
);

async function loadCounts(): Promise<void> {
    viewCounts.value = await fetchNotificationViewCounts();
}

watch([statusFilter, searchFilter, pageSize], () => {
    page.value = 1;
});
watch([page, statusFilter, searchFilter, pageSize], () => {
    void load();
    toQuery(buildUrlFilters(), page);
});

function onDataTableFilters(filters: { status: string; search: string }): void {
    statusFilter.value = filters.status;
    searchFilter.value = filters.search;
}

const actingId = ref<string | null>(null);
const actionError = ref('');
// Same store DefaultLayout's bell/panel read from (issue #92 follow-up) — acting on a
// notification here must also refresh it, or the topbar badge silently goes stale until the
// next unrelated bell action happens to refresh it.
const notificationsStore = useNotificationsStore();

async function onMarkRead(id: string): Promise<void> {
    actingId.value = id;
    actionError.value = '';
    try {
        const updated = await markNotificationRead(id);
        const index = notifications.value.findIndex(n => n.id === updated.id);
        if (index !== -1) notifications.value[index] = updated;
        await Promise.all([loadCounts(), notificationsStore.refresh()]);
    } catch (e) {
        actionError.value = e instanceof Error ? e.message : 'Could not mark notification as read';
    } finally {
        actingId.value = null;
    }
}

async function onResolve(id: string, resolution: string): Promise<void> {
    actingId.value = id;
    actionError.value = '';
    try {
        const updated = await resolveNotification(id, resolution);
        const index = notifications.value.findIndex(n => n.id === updated.id);
        if (index !== -1) notifications.value[index] = updated;
        await Promise.all([loadCounts(), notificationsStore.refresh()]);
    } catch (e) {
        actionError.value = e instanceof Error ? e.message : 'Could not resolve notification';
    } finally {
        actingId.value = null;
    }
}

onMounted(() => {
    void load();
    void loadCounts();
});
</script>

<template>
    <div class="notifications-page">
        <div class="notifications-page__breadcrumb">Workspace</div>
        <h1 class="notifications-page__title">Notifications</h1>

        <MvNotice v-if="actionError" variant="error">{{ actionError }}</MvNotice>

        <NotificationsDataTable
            :notifications="notifications"
            :loading="loading"
            :total-items="totalItems"
            :page="page"
            :page-size="pageSize"
            :status-filter="statusFilter"
            :search-filter="searchFilter"
            :administrator-id="authStore.administrator?.id ?? 'anonymous'"
            :acting-id="actingId"
            @update:filters="onDataTableFilters"
            @update:page="page = $event"
            @update:page-size="pageSize = $event"
            @reset-page="page = 1"
            @mark-read="onMarkRead"
            @resolve="onResolve"
        >
            <template #view-chips>
                <MvFilterChips :chips="viewChips" :active="activeView" @select="activeView = $event as ViewKey" />
            </template>
        </NotificationsDataTable>
    </div>
</template>

<style scoped>
.notifications-page {
    display: flex;
    flex-direction: column;
    gap: 14px;
    max-width: 1200px;
}

.notifications-page__breadcrumb {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}

.notifications-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}
</style>
