<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { MvErrorState, MvNotice, MvSkeleton, MvStatusBadge } from '@mivend/ui-kit';
import { REPORT_STATUS_VARIANT } from '../../api/analytics';
import { useAnalyticsReports } from '../../composables/useAnalyticsReports';

const { t } = useI18n();
const key = String(useRoute().params.report);
const { reports, loading, failed, load } = useAnalyticsReports();
const report = computed(() => reports.value.find(r => r.key === key) ?? null);
</script>

<template>
    <div class="report-page">
        <RouterLink class="report-page__back" to="/analytics">{{
            t('analytics.report.back')
        }}</RouterLink>
        <MvSkeleton v-if="loading" height="64px" />
        <MvErrorState
            v-else-if="failed"
            :title="t('analytics.catalog.loadFailedTitle')"
            :message="t('analytics.catalog.loadFailedMessage')"
            @retry="load"
        />
        <MvNotice v-else-if="!report" variant="warning">
            {{ t('analytics.report.notFound') }}
        </MvNotice>
        <template v-else>
            <h1 class="report-page__title">{{ report.title }}</h1>
            <MvStatusBadge :variant="REPORT_STATUS_VARIANT[report.status] ?? 'neutral'">
                {{ t(`analytics.status.${report.status}`) }}
            </MvStatusBadge>
            <p class="report-page__text">{{ report.description }}</p>
            <MvNotice variant="info">{{ t('analytics.report.notBuilt') }}</MvNotice>
            <h2 class="report-page__subtitle">{{ t('analytics.report.notes') }}</h2>
            <p class="report-page__text">{{ report.note }}</p>
        </template>
    </div>
</template>

<style scoped>
.report-page {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
}

.report-page > * {
    max-width: 720px;
}

.report-page__back {
    color: var(--el-text-color-secondary);
    font-size: 13px;
    text-decoration: none;
}

.report-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

.report-page__subtitle {
    margin: 8px 0 0;
    font-size: 16px;
}

.report-page__text {
    margin: 0;
    color: var(--el-text-color-secondary);
}

@media (max-width: 800px) {
    .report-page__title {
        font-size: 22px;
    }
}
</style>
