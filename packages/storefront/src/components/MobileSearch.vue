<script setup lang="ts">
import { ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { IconSearch, IconX } from '@tabler/icons-vue';
import { MvSearchInput, type SuggestionGroup, type SuggestionItem } from '@mivend/ui-kit';

const props = defineProps<{
    query: string;
    scopeLabel?: string;
    suggestions?: SuggestionGroup[];
}>();

const emit = defineEmits<{
    'update:query': [value: string];
    search: [value: string];
    select: [item: SuggestionItem];
    removeScope: [];
}>();

const { t } = useI18n();
const open = ref(false);
const overlayRef = ref<HTMLElement | null>(null);

watch(open, isOpen => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    // After the opening click reaches MvSearchInput's outside-click handler, or it resets its focus state.
    if (isOpen) setTimeout(() => overlayRef.value?.querySelector('input')?.focus(), 0);
});

function onSearch(value: string): void {
    open.value = false;
    emit('search', value);
}

function onSelect(item: SuggestionItem): void {
    open.value = false;
    emit('select', item);
}
</script>

<template>
    <button
        type="button"
        class="mobile-search__trigger"
        :aria-label="t('search.open')"
        @click="open = true"
    >
        <IconSearch :size="20" aria-hidden="true" />
    </button>

    <button
        v-if="props.query || props.scopeLabel"
        type="button"
        class="mobile-search__summary"
        @click="open = true"
    >
        <IconSearch :size="16" aria-hidden="true" />
        <span class="mobile-search__summary-text">{{ props.query }}</span>
        <span v-if="props.scopeLabel" class="mobile-search__summary-scope">{{
            props.scopeLabel
        }}</span>
    </button>

    <Teleport to="body">
        <div v-if="open" ref="overlayRef" class="mobile-search__overlay">
            <div class="mobile-search__bar">
                <div class="mobile-search__field">
                    <MvSearchInput
                        :model-value="props.query"
                        :placeholder="t('header.searchPlaceholderShort')"
                        :button-label="t('search.button')"
                        :clear-label="t('search.clear')"
                        :remove-scope-label="t('search.removeScope')"
                        :empty-text="(query: string) => t('search.noResults', { query })"
                        :suggestions="props.suggestions"
                        :scope-label="props.scopeLabel"
                        @update:model-value="emit('update:query', $event)"
                        @remove-scope="emit('removeScope')"
                        @search="onSearch"
                        @select="onSelect"
                    />
                </div>
                <button
                    type="button"
                    class="mobile-search__close"
                    :aria-label="t('search.close')"
                    @click="open = false"
                >
                    <IconX :size="22" aria-hidden="true" />
                </button>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
.mobile-search__trigger {
    width: 44px;
    height: 44px;
    border: 1px solid var(--app-nav-border-strong);
    border-radius: 50%;
    background: var(--app-surface);
    color: var(--el-text-color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}

.mobile-search__summary {
    order: 3;
    flex: 0 0 100%;
    min-width: 0;
    height: 40px;
    padding: 0 12px;
    border: 1px solid var(--app-nav-border-strong);
    border-radius: 12px;
    background: var(--app-surface);
    color: var(--el-text-color-primary);
    font: inherit;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
}

.mobile-search__summary-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
}

.mobile-search__summary-scope {
    flex-shrink: 0;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--app-chip-bg);
    color: var(--app-chip-fg);
    font-size: 12px;
    font-weight: 600;
}

.mobile-search__overlay {
    position: fixed;
    inset: 0;
    z-index: var(--mv-z-modal);
    background: var(--el-bg-color-page);
    padding: 12px 16px;
    overflow-y: auto;
}

.mobile-search__bar {
    display: flex;
    align-items: flex-start;
    gap: 8px;
}

.mobile-search__field {
    flex: 1;
    min-width: 0;
}

.mobile-search__close {
    width: 44px;
    height: 52px;
    border: none;
    background: transparent;
    color: var(--el-text-color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
}
</style>
