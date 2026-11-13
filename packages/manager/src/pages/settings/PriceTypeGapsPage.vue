<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvNotice, MvPanel } from '@mivend/ui-kit';
import { useAuthStore } from '../../stores/auth';
import { usePriceTypeGaps } from '../../composables/usePriceTypeGaps';
import PriceTypeGapsTable from '../../components/settings/PriceTypeGapsTable.vue';

const { t } = useI18n();
const authStore = useAuthStore();
const g = usePriceTypeGaps();
const administratorId = authStore.administrator?.id ?? 'anonymous';

watch([g.page, g.pageSize, g.search], () => void g.load());
watch([g.search, g.pageSize], () => (g.page.value = 1));
onMounted(() => void g.load());
</script>

<template>
    <div class="price-type-gaps-page">
        <div class="price-type-gaps-page__breadcrumb">{{ t('settingsSystem.breadcrumb') }}</div>
        <h1 class="price-type-gaps-page__title">{{ t('settingsSystem.priceTypeGaps.title') }}</h1>

        <MvNotice variant="info">
            {{ t('settingsSystem.priceTypeGaps.notice') }}
        </MvNotice>
        <MvNotice v-if="g.error.value" variant="error">{{ g.error.value }}</MvNotice>

        <MvPanel :title="t('settingsSystem.priceTypeGaps.panel')">
            <PriceTypeGapsTable
                :items="g.items.value"
                :loading="g.loading.value"
                :total-items="g.total.value"
                :page="g.page.value"
                :page-size="g.pageSize.value"
                :search-filter="g.search.value"
                :administrator-id="administratorId"
                @update:search="g.search.value = $event"
                @update:page="g.page.value = $event"
                @update:page-size="g.pageSize.value = $event"
            />
        </MvPanel>
    </div>
</template>

<style scoped>
.price-type-gaps-page {
    display: flex;
    flex-direction: column;
    gap: 18px;
}

.price-type-gaps-page__breadcrumb {
    color: var(--el-text-color-secondary);
    font-size: 13px;
}

.price-type-gaps-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}
</style>
