<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { MvErrorState, MvNotice, MvPageHeader, MvSkeleton } from '@mivend/ui-kit';
import { fetchManagerCard, type ManagerCard } from '../../api/managerCard';
import CustomersList from '../../components/customers/CustomersList.vue';
import OrdersList from '../../components/orders/OrdersList.vue';
import ManagerCardOverview from '../../components/team/ManagerCardOverview.vue';
import ManagerCardTabs from '../../components/team/ManagerCardTabs.vue';
import { useTabSync } from '../../composables/useTabSync';

const TABS = ['overview', 'customers', 'orders'] as const;
type ManagerCardTab = (typeof TABS)[number];

const { t } = useI18n();
const route = useRoute();
const { activeTab, selectTab } = useTabSync<ManagerCardTab>(TABS, 'overview');

const administratorId = computed(() => String(route.params.id));
const card = ref<ManagerCard | null>(null);
const loading = ref(true);
const failed = ref(false);
const lostAfterDays = ref(90);
let seq = 0;

async function load(): Promise<void> {
    const mine = (seq += 1);
    failed.value = false;
    try {
        const result = await fetchManagerCard(administratorId.value, lostAfterDays.value);
        if (mine === seq) card.value = result;
    } catch {
        if (mine === seq) failed.value = true;
    } finally {
        if (mine === seq) loading.value = false;
    }
}

watch([administratorId, lostAfterDays], load, { immediate: true });
</script>

<template>
    <div class="manager-card-page">
        <MvPageHeader
            :title="card?.administratorName ?? t('managerCard.page.breadcrumb')"
            :breadcrumbs="[{ label: t('managerCard.page.breadcrumb'), to: '/team' }]"
        />
        <div v-if="loading" class="manager-card-page__skeleton">
            <MvSkeleton v-for="i in 4" :key="i" height="84px" radius="12px" />
        </div>
        <MvErrorState v-else-if="failed" :title="t('managerCard.page.loadFailed')" />
        <MvNotice v-else-if="!card" variant="info">{{ t('managerCard.page.notFound') }}</MvNotice>
        <template v-else>
            <ManagerCardTabs
                :active="activeTab"
                :tabs="TABS"
                @select="selectTab($event as ManagerCardTab)"
            />
            <ManagerCardOverview
                v-if="activeTab === 'overview'"
                :card="card"
                @update:threshold="lostAfterDays = $event"
            />
            <CustomersList
                v-else-if="activeTab === 'customers'"
                :fixed-filter="{ assignedManagerId: { eq: administratorId } }"
                url-prefix="customers."
            />
            <OrdersList v-else :manager-id="administratorId" url-prefix="orders." />
        </template>
    </div>
</template>

<style scoped>
.manager-card-page__skeleton {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
}

@media (max-width: 800px) {
    .manager-card-page__skeleton {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
</style>
