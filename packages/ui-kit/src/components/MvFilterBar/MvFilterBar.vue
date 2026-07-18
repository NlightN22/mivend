<script setup lang="ts">
// Horizontal filter row: caller puts one MvFilterField per field in the default slot; the Reset
// button is built in. See docs/ai/manager-portal-pages/00-shared-conventions.md, "FilterBar".
const emit = defineEmits<{ reset: [] }>();
</script>

<template>
    <div class="mv-filter-bar">
        <slot />
        <button class="mv-filter-bar__reset" type="button" @click="emit('reset')">Reset</button>
    </div>
</template>

<style scoped>
.mv-filter-bar {
    display: grid;
    grid-template-columns: minmax(220px, 1.5fr) repeat(auto-fit, minmax(150px, 0.9fr)) auto;
    gap: 10px;
    align-items: end;
    padding: 14px 0 16px;
    border-bottom: 1px solid var(--el-border-color, #e4e7ec);
    margin-bottom: 14px;
}

.mv-filter-bar__reset {
    height: 40px;
    padding: 0 14px;
    border: 1px solid var(--el-border-color, #e4e7ec);
    border-radius: var(--app-radius-md, 12px);
    background: #fff;
    color: var(--el-text-color-regular, #374151);
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
}

.mv-filter-bar__reset:hover {
    background: var(--el-fill-color-light, #f8fafc);
}

@media (max-width: 900px) {
    .mv-filter-bar {
        grid-template-columns: 1fr 1fr;
    }
}

@media (max-width: 800px) {
    .mv-filter-bar {
        grid-template-columns: 1fr;
    }

    .mv-filter-bar__reset {
        width: 100%;
    }
}
</style>
