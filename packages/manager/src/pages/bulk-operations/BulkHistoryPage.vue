<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { useAuthStore } from '../../stores/auth';
import { useBulkHistory } from '../../composables/useBulkHistory';
import BulkHistoryTable from '../../components/bulk-operations/BulkHistoryTable.vue';
import BulkOperationsTabs from '../../components/bulk-operations/BulkOperationsTabs.vue';

const { t } = useI18n();
const authStore = useAuthStore();
const history = useBulkHistory();
</script>

<template>
    <div class="bulk-page">
        <h1 class="bulk-page__title">{{ t('bulkOperations.title') }}</h1>
        <BulkOperationsTabs />
        <BulkHistoryTable
            :history="history"
            :administrator-id="authStore.administrator?.id ?? 'anonymous'"
        />
    </div>
</template>

<style scoped>
.bulk-page {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.bulk-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

@media (max-width: 800px) {
    .bulk-page__title {
        font-size: 22px;
    }
}
</style>
