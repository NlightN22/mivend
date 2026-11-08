<script setup lang="ts">
defineProps<{ title: string; count: number }>();
</script>

<template>
    <div class="doc-toolbar">
        <h3 class="doc-toolbar__title">
            {{ title }}
            <span class="doc-toolbar__count" data-testid="doc-lines-count">
                {{ count }} {{ count === 1 ? 'position' : 'positions' }}
            </span>
        </h3>
        <div class="doc-toolbar__end"><slot name="toolbar" /></div>
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

.doc-toolbar__title {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: var(--el-text-color-primary);
}

.doc-toolbar__count {
    margin-left: 6px;
    font-weight: 500;
    color: var(--app-text-grey);
}

.doc-toolbar__end {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
}
</style>
