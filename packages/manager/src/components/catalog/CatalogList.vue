<script setup lang="ts" generic="T extends CatalogItem">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvCard, MvErrorState, MvNotice, MvInput, MvSkeleton } from '@mivend/ui-kit';
import { filterOperations, groupOperations, searchable, type CatalogItem } from './catalogGroups';

// Entries the server lists for this user, grouped by area and searchable once there are many; `i18nBase`
// holds search, loadFailedTitle, loadFailedMessage, none and noMatch under its `catalog` node.
const props = defineProps<{
    operations: T[];
    basePath: string;
    i18nBase: string;
    loading: boolean;
    failed: boolean;
}>();
const emit = defineEmits<{ retry: [] }>();
defineSlots<{ meta?: (props: { entry: T }) => unknown }>();

const { t } = useI18n();
const query = ref('');
const groups = computed(() => groupOperations(filterOperations(props.operations, query.value)));
const text = (key: string): string => t(`${props.i18nBase}.catalog.${key}`);
</script>

<template>
    <div class="catalog-list">
        <MvInput v-if="searchable(operations)" v-model="query" :placeholder="text('search')" />
        <MvSkeleton v-if="loading" height="64px" />
        <MvErrorState
            v-else-if="failed"
            :title="text('loadFailedTitle')"
            :message="text('loadFailedMessage')"
            @retry="emit('retry')"
        />
        <MvNotice v-else-if="!operations.length" variant="info">
            {{ text('none') }}
        </MvNotice>
        <MvNotice v-else-if="!groups.some(g => g.operations.length)" variant="info">
            {{ text('noMatch') }}
        </MvNotice>
        <template v-else>
            <section v-for="group in groups" :key="group.area" class="catalog-list__group">
                <h2 v-if="group.area" class="catalog-list__area">{{ group.area }}</h2>
                <ul class="catalog-list__list">
                    <li v-for="op in group.operations" :key="op.key">
                        <RouterLink :to="`${basePath}/${op.key}`" class="catalog-list__link">
                            <MvCard class="catalog-list__card">
                                <span class="catalog-list__title">{{ op.title }}</span>
                                <slot name="meta" :entry="op" />
                                <span class="catalog-list__text">{{ op.description }}</span>
                            </MvCard>
                        </RouterLink>
                    </li>
                </ul>
            </section>
        </template>
    </div>
</template>

<style scoped>
.catalog-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.catalog-list__area {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 700;
    text-transform: capitalize;
    color: var(--el-text-color-secondary);
}

.catalog-list__list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
}

.catalog-list__link {
    display: block;
    color: inherit;
    text-decoration: none;
}

.catalog-list__card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    height: 100%;
    box-sizing: border-box;
}

.catalog-list__link:hover .catalog-list__title {
    text-decoration: underline;
}

.catalog-list__title {
    font-size: 16px;
    font-weight: 700;
}

.catalog-list__text {
    color: var(--el-text-color-secondary);
    font-size: 13px;
}
</style>
