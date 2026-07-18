<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import MvCheckbox from '../MvCheckbox/MvCheckbox.vue';
import MvButton from '../MvButton/MvButton.vue';
import type { ColumnVisibilityDef } from '../../composables/useColumnVisibility';

defineProps<{ columns: (ColumnVisibilityDef & { visible: boolean })[] }>();
const emit = defineEmits<{ toggle: [key: string] }>();

const open = ref(false);
const rootEl = ref<HTMLElement | null>(null);

function onDocClick(e: MouseEvent): void {
    if (rootEl.value && !rootEl.value.contains(e.target as Node)) open.value = false;
}
function onEscape(e: KeyboardEvent): void {
    if (e.key === 'Escape') open.value = false;
}

onMounted(() => {
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onEscape);
});
onBeforeUnmount(() => {
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onEscape);
});
</script>

<template>
    <div ref="rootEl" class="mv-column-toggle">
        <MvButton size="sm" variant="ghost" @click="open = !open">Columns</MvButton>
        <div v-if="open" class="mv-column-toggle__panel">
            <label v-for="col in columns" :key="col.key" class="mv-column-toggle__row">
                <MvCheckbox :model-value="col.visible" @update:model-value="emit('toggle', col.key)" />
                <span>{{ col.label }}</span>
            </label>
        </div>
    </div>
</template>

<style scoped>
.mv-column-toggle {
    position: relative;
    display: inline-block;
}

.mv-column-toggle__panel {
    position: absolute;
    right: 0;
    top: calc(100% + 6px);
    z-index: 30;
    min-width: 200px;
    padding: 10px;
    background: white;
    border: 1px solid #e4e7ec;
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(20, 42, 65, 0.12);
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.mv-column-toggle__row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    cursor: pointer;
    padding: 4px 6px;
    border-radius: 6px;
}

.mv-column-toggle__row:hover {
    background: #f8fafc;
}
</style>
