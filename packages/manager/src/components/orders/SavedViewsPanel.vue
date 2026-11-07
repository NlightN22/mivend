<script setup lang="ts">
export interface SavedView {
    key: string;
    label: string;
    count: number;
}

defineProps<{ views: SavedView[] }>();
const emit = defineEmits<{ select: [key: string] }>();
</script>

<template>
    <ul class="saved-views">
        <li
            v-for="view in views"
            :key="view.key"
            class="saved-views__item"
            @click="emit('select', view.key)"
        >
            <span class="saved-views__name">{{ view.label }}</span>
            <span class="saved-views__count">{{ view.count }}</span>
        </li>
    </ul>
</template>

<style scoped>
.saved-views {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.saved-views__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--app-nav-border);
    border-radius: var(--app-radius-md, 14px);
    background: var(--app-surface);
    cursor: pointer;
}

.saved-views__item:hover {
    background: var(--app-fill-soft);
    border-color: var(--app-nav-border-strong);
}

.saved-views__name {
    font-weight: 700;
    font-size: 13px;
    color: var(--app-text-deep);
}

.saved-views__count {
    font-weight: 800;
    font-size: 12px;
    color: var(--app-text-grey);
}
</style>
