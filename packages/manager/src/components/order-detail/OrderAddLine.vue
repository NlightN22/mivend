<script setup lang="ts">
import { ref } from 'vue';
import { MvInput } from '@mivend/ui-kit';
import type { SkuMatch } from '../../api/orderLineEdit';

defineProps<{ matches: SkuMatch[]; busy: boolean }>();
const emit = defineEmits<{ search: [query: string]; add: [sku: string] }>();

const value = ref('');

function update(next: string | number): void {
    value.value = String(next);
    emit('search', value.value);
}

function choose(sku: string): void {
    emit('add', sku);
    value.value = '';
}
</script>

<template>
    <div class="add-line" data-testid="order-add-line">
        <MvInput
            size="sm"
            :model-value="value"
            :disabled="busy"
            placeholder="Add by article"
            aria-label="Add by article (SKU)"
            @update:model-value="update"
            @keydown.enter="value.trim() && choose(value.trim())"
        />
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
</template>

<style scoped>
.add-line {
    position: relative;
    width: 240px;
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
    box-shadow: 0 8px 24px var(--app-ink-14);
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

@media (max-width: 800px) {
    .add-line {
        width: 100%;
    }
}
</style>
