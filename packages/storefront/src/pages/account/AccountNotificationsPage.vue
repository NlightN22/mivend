<script setup lang="ts">
import { ref, watch } from 'vue';
import { MvPagination, MvInput } from '@mivend/ui-kit';
import type { NotificationItem, NotificationStatus } from '@mivend/ui-kit';
import AccountSidebar from './AccountSidebar.vue';
import { fetchNotifications, markNotificationRead } from '../../api/notifications';

// issue #92: the full notifications page the bell panel's "Show all notifications" link opens —
// real server-side search/status filter/pagination, unlike the panel which only ever shows the
// most recent handful. No "resolve" action here (unlike the manager portal's own notifications
// page): a customer's own notifications (order updates, document ready, etc.) are informational,
// not operational issues someone needs to annotate with a resolution — mark-as-read is enough.
const PAGE_SIZE = 20;

const notifications = ref<NotificationItem[]>([]);
const totalItems = ref(0);
const loading = ref(false);
const page = ref(1);
const searchTerm = ref('');
const activeStatus = ref<'all' | NotificationStatus>('all');

const STATUS_FILTERS: { key: 'all' | NotificationStatus; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'unread', label: 'Unread' },
    { key: 'read', label: 'Read' },
];

async function load(): Promise<void> {
    loading.value = true;
    try {
        const result = await fetchNotifications({
            status: activeStatus.value === 'all' ? undefined : activeStatus.value,
            search: searchTerm.value.trim() || undefined,
            take: PAGE_SIZE,
            skip: (page.value - 1) * PAGE_SIZE,
        });
        notifications.value = result.items;
        totalItems.value = result.totalItems;
    } finally {
        loading.value = false;
    }
}

watch([activeStatus, page], load);

let searchDebounce: ReturnType<typeof setTimeout> | undefined;
watch(searchTerm, () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
        page.value = 1;
        void load();
    }, 300);
});

async function onRowClick(item: NotificationItem): Promise<void> {
    if (item.status !== 'unread') return;
    const updated = await markNotificationRead(item.id);
    const index = notifications.value.findIndex(n => n.id === updated.id);
    if (index !== -1) notifications.value[index] = updated;
}

function formatDate(iso: string): string {
    return (
        new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
        ' · ' +
        new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    );
}

void load();
</script>

<template>
    <div class="account-notifications-page">
        <AccountSidebar />

        <section class="account-notifications-page__content">
            <div class="account-notifications-page__head">
                <h1 class="account-notifications-page__title">Notifications</h1>
                <p class="account-notifications-page__subtitle">All your notifications, newest first.</p>
            </div>

            <div class="account-notifications-page__toolbar">
                <MvInput v-model="searchTerm" placeholder="Search notifications…" />
                <div class="account-notifications-page__filters">
                    <button
                        v-for="f in STATUS_FILTERS"
                        :key="f.key"
                        type="button"
                        class="account-notifications-page__filter"
                        :class="{ 'account-notifications-page__filter--active': activeStatus === f.key }"
                        @click="activeStatus = f.key; page = 1"
                    >
                        {{ f.label }}
                    </button>
                </div>
            </div>

            <div v-if="loading" class="account-notifications-page__state">Loading…</div>
            <div v-else-if="!notifications.length" class="account-notifications-page__state">
                No notifications found.
            </div>
            <template v-else>
                <MvPagination :page="page" :page-size="PAGE_SIZE" :total="totalItems" @update:page="page = $event" />
                <div class="account-notifications-page__list">
                    <button
                        v-for="n in notifications"
                        :key="n.id"
                        type="button"
                        class="account-notifications-page__row"
                        :class="{ 'account-notifications-page__row--unread': n.status === 'unread' }"
                        @click="onRowClick(n)"
                    >
                        <span
                            class="account-notifications-page__indicator"
                            :class="`account-notifications-page__indicator--${n.kind}`"
                        />
                        <div class="account-notifications-page__body">
                            <div class="account-notifications-page__row-header">
                                <span class="account-notifications-page__row-title">{{ n.title }}</span>
                                <span class="account-notifications-page__row-time">{{ formatDate(n.createdAt) }}</span>
                            </div>
                            <p class="account-notifications-page__row-message">{{ n.message }}</p>
                        </div>
                    </button>
                </div>
                <MvPagination :page="page" :page-size="PAGE_SIZE" :total="totalItems" @update:page="page = $event" />
            </template>
        </section>
    </div>
</template>

<style scoped>
.account-notifications-page {
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr);
    gap: 24px;
    align-items: start;
    max-width: 1440px;
    margin: 0 auto;
    padding: 24px 28px 56px;
}

.account-notifications-page__content {
    min-width: 0;
}

.account-notifications-page__head {
    margin-bottom: 18px;
}

.account-notifications-page__title {
    margin: 0 0 6px;
    font-size: clamp(34px, 3.6vw, 50px);
    line-height: 0.98;
    letter-spacing: -0.055em;
}

.account-notifications-page__subtitle {
    margin: 0;
    color: #66736e;
    font-size: 14px;
    line-height: 1.45;
}

.account-notifications-page__toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
}

.account-notifications-page__toolbar :deep(.mv-input) {
    max-width: 280px;
    flex: 1;
}

.account-notifications-page__filters {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.account-notifications-page__filter {
    border: 1px solid rgba(221, 231, 226, 0.9);
    border-radius: 999px;
    background: #fff;
    padding: 8px 14px;
    font-weight: 800;
    font-size: 13px;
    color: #263732;
    cursor: pointer;
}

.account-notifications-page__filter--active {
    background: #008a64;
    color: #fff;
    border-color: #008a64;
}

.account-notifications-page__state {
    text-align: center;
    padding: 48px 24px;
    color: #66736e;
    font-size: 15px;
}

.account-notifications-page__list {
    display: grid;
    gap: 10px;
}

.account-notifications-page__row {
    display: flex;
    gap: 12px;
    width: 100%;
    text-align: left;
    background: #fff;
    border: 1px solid rgba(221, 231, 226, 0.86);
    border-radius: 16px;
    padding: 14px 16px;
    cursor: pointer;
}

.account-notifications-page__row--unread {
    background: #f5fbf9;
}

.account-notifications-page__indicator {
    flex-shrink: 0;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-top: 6px;
}

.account-notifications-page__indicator--info { background: #00a878; }
.account-notifications-page__indicator--success { background: #10b981; }
.account-notifications-page__indicator--warning { background: #ff8a00; }
.account-notifications-page__indicator--error { background: #ef4444; }

.account-notifications-page__body {
    flex: 1;
    min-width: 0;
}

.account-notifications-page__row-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
}

.account-notifications-page__row-title {
    font-size: 14px;
    font-weight: 800;
}

.account-notifications-page__row-time {
    flex-shrink: 0;
    font-size: 12px;
    color: #8a968f;
}

.account-notifications-page__row-message {
    margin: 4px 0 0;
    font-size: 13px;
    color: #66736e;
    line-height: 1.4;
}

@media (max-width: 960px) {
    .account-notifications-page {
        grid-template-columns: 1fr;
        padding-left: 16px;
        padding-right: 16px;
    }
}
</style>
