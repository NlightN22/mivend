<script setup lang="ts">
import { useUiLabels } from '../../utils/uiLabels';
import { onMounted, ref } from 'vue';
import { IconSearch, IconX } from '@tabler/icons-vue';
const uiLabel = useUiLabels();

defineProps<{ placeholder: string }>();
const query = defineModel<string>('query', { default: '' });
const emit = defineEmits<{ search: [value: string]; close: [] }>();

const field = ref<HTMLInputElement | null>(null);
onMounted(() => field.value?.focus());

function submit(): void {
    const value = query.value.trim();
    if (value) emit('search', value);
}
</script>

<template>
    <form class="phone-search" role="search" @submit.prevent="submit">
        <IconSearch :size="18" aria-hidden="true" class="phone-search__icon" />
        <input
            ref="field"
            v-model="query"
            class="phone-search__input"
            type="search"
            enterkeyhint="search"
            :placeholder="placeholder"
            :aria-label="placeholder"
            @keydown.esc="emit('close')"
        />
        <button
            type="button"
            class="phone-search__close"
            :aria-label="uiLabel('closeSearch', 'Close search')"
            :title="uiLabel('closeSearch', 'Close search')"
            @click="emit('close')"
        >
            <IconX :size="20" aria-hidden="true" />
        </button>
    </form>
</template>

<style scoped>
.phone-search {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 8px;
    min-width: 0;
    position: relative;
}

.phone-search__input {
    flex: 1;
    min-width: 0;
    height: 40px;
    padding: 0 14px 0 38px;
    border: 1px solid var(--el-border-color);
    border-radius: 999px;
    background: var(--el-fill-color-light);
    color: var(--el-text-color-primary);
    font-size: 16px;
    outline: none;
}

.phone-search__input:focus-visible {
    border-color: var(--el-color-primary);
}

.phone-search__icon {
    position: absolute;
    left: 14px;
    color: var(--el-text-color-secondary);
    pointer-events: none;
}

.phone-search__close {
    flex-shrink: 0;
    display: grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border: 1px solid var(--el-border-color);
    border-radius: 50%;
    background: var(--app-surface);
    color: var(--el-text-color-primary);
    cursor: pointer;
}
</style>
