<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvStatusBadge } from '@mivend/ui-kit';
import { REPORT_STATUS_VARIANT } from '../../api/analytics';
import CatalogList from '../../components/catalog/CatalogList.vue';
import { useAnalyticsReports } from '../../composables/useAnalyticsReports';

const { t } = useI18n();
const { reports, loading, failed, load } = useAnalyticsReports();
</script>

<template>
    <div class="analytics-page">
        <h1 class="analytics-page__title">{{ t('analytics.title') }}</h1>
        <CatalogList
            :operations="reports"
            base-path="/analytics"
            i18n-base="analytics"
            :loading="loading"
            :failed="failed"
            @retry="load"
        >
            <template #meta="{ entry }">
                <MvStatusBadge :variant="REPORT_STATUS_VARIANT[entry.status] ?? 'neutral'">
                    {{ t(`analytics.status.${entry.status}`) }}
                </MvStatusBadge>
            </template>
        </CatalogList>
    </div>
</template>

<style scoped>
.analytics-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.analytics-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

@media (max-width: 800px) {
    .analytics-page__title {
        font-size: 22px;
    }
}
</style>
