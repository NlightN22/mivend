<script setup lang="ts">
import { ref } from 'vue';
import { IconPlus } from '@tabler/icons-vue';
import { MvButton, MvInput } from '@mivend/ui-kit';
import type { SkuMatch } from '../../api/orderLineEdit';

defineProps<{ matches: SkuMatch[]; busy: boolean }>();
const emit = defineEmits<{ search: [query: string]; add: [sku: string] }>();

const open = ref(false);
const value = ref('');

function update(next: string | number): void {
    value.value = String(next);
    emit('search', value.value);
}

function choose(sku: string): void {
    emit('add', sku);
    value.value = '';
    open.value = false;
}
</script>

<template>
    <div class="add-line">
        <MvButton v-if="!open" variant="secondary" size="sm" @click="open = true">
            <IconPlus :size="16" /> Add position
        </MvButton>
        <div v-else class="add-line__form">
            <MvInput
                size="sm"
                :model-value="value"
                placeholder="Article (SKU)"
                aria-label="Article (SKU)"
                @update:model-value="update"
                @keydown.enter="value.trim() && choose(value.trim())"
            />
            <MvButton variant="secondary" size="sm" @click="open = false">Close</MvButton>
            <ul v-if="matches.length" class="add-line__matches" role="listbox">
                <li v-for="m in matches" :key="m.id">
                    <button
                        type="button"
                        class="add-line__match"
                        :disabled="busy"
                        @click="choose(m.sku)"
                    >
                        <strong>{{ m.sku }}</strong> {{ m.name }}
                    </button>
                </li>
            </ul>
        </div>
    </div>
</template>

<style scoped>
.add-line {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.add-line__form {
    position: relative;
    display: flex;
    gap: 8px;
}

.add-line__matches {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 5;
    min-width: 280px;
    margin: 4px 0 0;
    padding: 4px;
    list-style: none;
    background: var(--app-surface);
    border: 1px solid var(--app-nav-border-strong);
    border-radius: var(--app-radius-sm, 8px);
}

.add-line__match {
    display: block;
    width: 100%;
    padding: 6px 8px;
    border: 0;
    background: none;
    text-align: left;
    font: inherit;
    cursor: pointer;
}

.add-line__match:hover {
    background: var(--app-row-hover);
}
</style>
