<script setup lang="ts">
import { MvStatusBadge, formatDocumentNumber } from '@mivend/ui-kit';
import type { SearchGroup, SearchHit } from '../../api/globalSearch';
import { humanize, searchHitKey as resultKey, searchKindLabel } from '../../utils/searchTarget';
import { documentTypeVariant } from '../../utils/documentTypeVariant';

defineProps<{ groups: SearchGroup[]; activeKey: string | null }>();
defineEmits<{ select: [kind: string, hit: SearchHit] }>();
</script>

<template>
    <div class="search-results" role="listbox" aria-label="Search results">
        <section v-for="group in groups" :key="group.kind" class="search-results__group">
            <h2 class="search-results__title">{{ searchKindLabel(group.kind) }}</h2>
            <button
                v-for="hit in group.items"
                :id="`search-hit-${resultKey(group.kind, hit)}`"
                :key="hit.id"
                type="button"
                role="option"
                class="search-results__row"
                :class="{ 'search-results__row--active': activeKey === resultKey(group.kind, hit) }"
                :aria-selected="activeKey === resultKey(group.kind, hit)"
                @click="$emit('select', group.kind, hit)"
            >
                <span class="search-results__text">
                    <span class="search-results__line">
                        <strong v-if="hit.number" class="search-results__number">{{
                            group.kind === 'counterparty'
                                ? hit.number
                                : formatDocumentNumber(hit.number)
                        }}</strong>
                        <span v-if="hit.title !== hit.number" class="search-results__name">{{
                            hit.title
                        }}</span>
                    </span>
                    <span v-if="hit.subtitle" class="search-results__sub">{{ hit.subtitle }}</span>
                </span>
                <MvStatusBadge v-if="hit.status" :variant="documentTypeVariant(hit.status)">
                    {{ humanize(hit.status) }}
                </MvStatusBadge>
            </button>
        </section>
    </div>
</template>

<style scoped>
.search-results {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
}

.search-results__title {
    margin: 0;
    padding: 6px 8px 2px;
    color: var(--app-text-body2);
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
}

.search-results__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    min-height: 44px;
    padding: 4px 8px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--el-text-color-primary);
    text-align: left;
    cursor: pointer;
}

.search-results__row:hover,
.search-results__row--active {
    background: var(--app-row-hover);
}

.search-results__text {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.search-results__line {
    display: flex;
    gap: 8px;
    min-width: 0;
    font-size: 14px;
}

.search-results__number {
    flex-shrink: 0;
}

.search-results__name,
.search-results__sub {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.search-results__sub {
    color: var(--app-text-body2);
    font-size: 12px;
}
</style>
