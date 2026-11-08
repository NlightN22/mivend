<script setup lang="ts">
import MvButton from '../MvButton/MvButton.vue';

defineProps<{
    title: string;
    count: number;
    selectable: boolean;
    selecting: boolean;
    selectedCount: number;
}>();
defineEmits<{ select: []; cancel: [] }>();
</script>

<template>
    <div class="doc-toolbar" :class="{ 'doc-toolbar--selecting': selecting }">
        <template v-if="selecting">
            <span class="doc-toolbar__count" data-testid="doc-selected-count">
                {{ selectedCount }} selected
            </span>
            <div class="doc-toolbar__end">
                <slot name="bulk" :count="selectedCount" />
                <MvButton size="sm" variant="ghost" @click="$emit('cancel')">Cancel</MvButton>
            </div>
        </template>
        <template v-else>
            <h3 class="doc-toolbar__title">
                {{ title }} <span class="doc-toolbar__count">{{ count }}</span>
            </h3>
            <div class="doc-toolbar__end">
                <slot name="toolbar" />
                <MvButton v-if="selectable" size="sm" variant="ghost" @click="$emit('select')">
                    Select
                </MvButton>
            </div>
        </template>
    </div>
</template>

<style scoped>
.doc-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px 12px;
    min-height: 40px;
    margin-bottom: 4px;
}

.doc-toolbar--selecting {
    padding: 4px 8px;
    border-radius: var(--app-radius-sm, 8px);
    background: var(--app-stock-in-bg);
}

.doc-toolbar__title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--el-text-color-primary);
}

.doc-toolbar__count {
    margin-left: 4px;
    font-weight: 600;
    color: var(--app-text-grey);
}

.doc-toolbar__end {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
}

@media (max-width: 800px) {
    .doc-toolbar__end {
        width: 100%;
    }
}
</style>
