<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { fetchBulkCatalog, type BulkOperationInfo } from '../../api/bulkOperations';
import CatalogList from '../../components/catalog/CatalogList.vue';
import BulkOperationsTabs from '../../components/bulk-operations/BulkOperationsTabs.vue';
import { operationUi } from '../../components/bulk-operations/operationUi';

const { t } = useI18n();
const catalog = ref<BulkOperationInfo[]>([]);
const loading = ref(true);
const failed = ref(false);
// An operation without a wizard in this portal build cannot be opened, so it is not offered.
const operations = computed(() =>
    catalog.value.filter(o => operationUi(o.type)).map(o => ({ ...o, key: o.type })),
);

async function load(): Promise<void> {
    loading.value = true;
    failed.value = false;
    try {
        catalog.value = await fetchBulkCatalog();
    } catch {
        failed.value = true;
    } finally {
        loading.value = false;
    }
}
onMounted(() => void load());
</script>

<template>
    <div class="bulk-page">
        <h1 class="bulk-page__title">{{ t('bulkOperations.title') }}</h1>
        <BulkOperationsTabs />
        <CatalogList
            :operations="operations"
            base-path="/bulk-operations"
            i18n-base="bulkOperations"
            :loading="loading"
            :failed="failed"
            @retry="load"
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
