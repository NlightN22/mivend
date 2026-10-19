<script setup lang="ts">
import { formatDate } from '../../i18n/format';
import { ref, toRef, watch } from 'vue';
import type { Ref } from 'vue';
import { MvPagination, MvInput, useUrlState } from '@mivend/ui-kit';
import type { NotificationItem, NotificationStatus } from '@mivend/ui-kit';
import AccountSidebar from './AccountSidebar.vue';
import { fetchNotifications, markNotificationRead } from '../../api/notifications';
import { useNotificationsStore } from '../../stores/notifications';
import { usePaginationLabels } from '../../composables/usePaginationLabels';

const paginationLabels = usePaginationLabels();

// Shared with the header bell, so marking read here refreshes its badge too.
const notificationsStore = useNotificationsStore();

// Customer notifications are informational: mark-as-read only, no resolve action (#92).
const PAGE_SIZE = 20;

const notifications = ref<NotificationItem[]>([]);
const totalItems = ref(0);
const loading = ref(false);
const { filters: urlState, page } = useUrlState({ status: 'all', q: '' }, { typingKeys: ['q'] });
const searchTerm = toRef(urlState, 'q');
const activeStatus = toRef(urlState, 'status') as Ref<'all' | NotificationStatus>;

const STATUS_FILTERS: ('all' | NotificationStatus)[] = ['all', 'unread', 'read'];

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
        void load();
    }, 300);
});

async function onRowClick(item: NotificationItem): Promise<void> {
    if (item.status !== 'unread') return;
    const updated = await markNotificationRead(item.id);
    const index = notifications.value.findIndex(n => n.id === updated.id);
    if (index !== -1) notifications.value[index] = updated;
    await notificationsStore.refresh();
}

function formatDateTime(iso: string): string {
    return (
        formatDate(iso, { day: '2-digit', month: 'short', year: 'numeric' }) +
        ' · ' +
        formatDate(iso, { hour: '2-digit', minute: '2-digit' })
    );
}

void load();
</script>

<template>
    <div class="account-notifications-page">
        <AccountSidebar />

        <section class="account-notifications-page__content">
            <div class="account-notifications-page__head">
                <h1 class="account-notifications-page__title">
                    {{ $t('notifications.title') }}
                </h1>
                <p class="account-notifications-page__subtitle">
                    {{ $t('notifications.subtitle') }}
                </p>
            </div>

            <div class="account-notifications-page__toolbar">
                <MvInput v-model="searchTerm" :placeholder="$t('notifications.search')" />
                <div class="account-notifications-page__filters">
                    <button
                        v-for="f in STATUS_FILTERS"
                        :key="f"
                        type="button"
                        class="account-notifications-page__filter"
                        :class="{
                            'account-notifications-page__filter--active': activeStatus === f,
                        }"
                        @click="
                            activeStatus = f;
                            page = 1;
                        "
                    >
                        {{ $t(`notifications.filter.${f}`) }}
                    </button>
                </div>
            </div>

            <div v-if="loading" class="account-notifications-page__state">
                {{ $t('notifications.loading') }}
            </div>
            <div v-else-if="!notifications.length" class="account-notifications-page__state">
                {{ $t('notifications.empty') }}
            </div>
            <template v-else>
                <MvPagination
                    v-bind="paginationLabels"
                    :page="page"
                    :page-size="PAGE_SIZE"
                    :total="totalItems"
                    @update:page="page = $event"
                />
                <div class="account-notifications-page__list">
                    <button
                        v-for="n in notifications"
                        :key="n.id"
                        type="button"
                        class="account-notifications-page__row"
                        :class="{
                            'account-notifications-page__row--unread': n.status === 'unread',
                        }"
                        @click="onRowClick(n)"
                    >
                        <span
                            class="account-notifications-page__indicator"
                            :class="`account-notifications-page__indicator--${n.kind}`"
                        />
                        <div class="account-notifications-page__body">
                            <div class="account-notifications-page__row-header">
                                <span class="account-notifications-page__row-title">{{
                                    n.title
                                }}</span>
                                <span class="account-notifications-page__row-time">{{
                                    formatDateTime(n.createdAt)
                                }}</span>
                            </div>
                            <p class="account-notifications-page__row-message">{{ n.message }}</p>
                        </div>
                    </button>
                </div>
                <MvPagination
                    v-bind="paginationLabels"
                    :page="page"
                    :page-size="PAGE_SIZE"
                    :total="totalItems"
                    @update:page="page = $event"
                />
            </template>
        </section>
    </div>
</template>

<style scoped src="./AccountNotificationsPage.css"></style>
