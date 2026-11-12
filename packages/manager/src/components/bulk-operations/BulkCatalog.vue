<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvCard, MvErrorState, MvNotice, MvInput, MvSkeleton } from '@mivend/ui-kit';
import type { BulkOperationInfo } from '../../api/bulkOperations';
import { filterOperations, groupOperations, searchable } from './catalogGroups';

// Operations the server lists for this user; grouped by area and searchable once there are many.
const props = defineProps<{
    operations: BulkOperationInfo[];
    loading: boolean;
    failed: boolean;
}>();
const emit = defineEmits<{ retry: [] }>();

const { t } = useI18n();
const query = ref('');
const groups = computed(() => groupOperations(filterOperations(props.operations, query.value)));
</script>

<template>
    <div class="bulk-catalog">
        <MvInput v-if="searchable(operations)" v-model="query" :placeholder="t('bulkOperations.catalog.search')" />
        <MvSkeleton v-if="loading" height="64px" />
        <MvErrorState
            v-else-if="failed"
            :title="t('bulkOperations.catalog.loadFailedTitle')"
            :message="t('bulkOperations.catalog.loadFailedMessage')"
            @retry="emit('retry')"
        />
        <MvNotice v-else-if="!operations.length" variant="info">
            {{ t('bulkOperations.catalog.none') }}
        </MvNotice>
        <MvNotice v-else-if="!groups.some(g => g.operations.length)" variant="info">
            {{ t('bulkOperations.catalog.noMatch') }}
        </MvNotice>
        <template v-else>
            <section v-for="group in groups" :key="group.area" class="bulk-catalog__group">
                <h2 v-if="group.area" class="bulk-catalog__area">{{ group.area }}</h2>
                <ul class="bulk-catalog__list">
                    <li v-for="op in group.operations" :key="op.type">
                        <RouterLink :to="`/bulk-operations/${op.type}`" class="bulk-catalog__link">
                            <MvCard class="bulk-catalog__card">
                                <span class="bulk-catalog__title">{{ op.title }}</span>
                                <span class="bulk-catalog__text">{{ op.description }}</span>
                            </MvCard>
                        </RouterLink>
                    </li>
                </ul>
            </section>
        </template>
    </div>
</template>

<style scoped>
.bulk-catalog {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.bulk-catalog__area {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 700;
    text-transform: capitalize;
    color: var(--el-text-color-secondary);
}

.bulk-catalog__list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
}

.bulk-catalog__link {
    display: block;
    color: inherit;
    text-decoration: none;
}

.bulk-catalog__card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    height: 100%;
    box-sizing: border-box;
}

.bulk-catalog__link:hover .bulk-catalog__title {
    text-decoration: underline;
}

.bulk-catalog__title {
    font-size: 16px;
    font-weight: 700;
}

.bulk-catalog__text {
    color: var(--el-text-color-secondary);
    font-size: 13px;
}
</style>
