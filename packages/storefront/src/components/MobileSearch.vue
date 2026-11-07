<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { IconSearch, IconX } from '@tabler/icons-vue';
import { MvSearchInput, type SuggestionGroup, type SuggestionItem } from '@mivend/ui-kit';

const props = defineProps<{
    query: string;
    suggestions?: SuggestionGroup[];
}>();

const emit = defineEmits<{
    'update:query': [value: string];
    search: [value: string];
    select: [item: SuggestionItem];
}>();

const { t } = useI18n();
const open = ref(false);
const overlayRef = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLButtonElement | null>(null);

watch(open, isOpen => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    // After the opening click reaches MvSearchInput's outside-click handler, or it resets its focus state.
    if (isOpen) setTimeout(() => overlayRef.value?.querySelector('input')?.focus(), 0);
    else nextTick(() => triggerRef.value?.focus());
});

onBeforeUnmount(() => {
    document.body.style.overflow = '';
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
        ref="triggerRef"
        type="button"
        class="mobile-search__trigger"
        :aria-label="t('search.open')"
        @click="open = true"
    >
        <IconSearch :size="20" aria-hidden="true" />
    </button>

    <Teleport to="body">
        <div
            v-if="open"
            ref="overlayRef"
            class="mobile-search__overlay"
            role="dialog"
            aria-modal="true"
            :aria-label="t('search.open')"
            @keydown.esc="open = false"
        >
            <MvSearchInput
                :model-value="props.query"
                :placeholder="t('header.searchPlaceholderShort')"
                :clear-label="t('search.clear')"
                :empty-text="(query: string) => t('search.noResults', { query })"
                :suggestions="props.suggestions"
                @update:model-value="emit('update:query', $event)"
                @search="onSearch"
                @select="onSelect"
            >
                <template #submit>
                    <button
                        type="button"
                        class="mobile-search__close"
                        :aria-label="t('search.close')"
                        @click="open = false"
                    >
                        <IconX :size="22" aria-hidden="true" />
                    </button>
                </template>
            </MvSearchInput>
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

.mobile-search__overlay {
    position: fixed;
    inset: 0;
    z-index: var(--mv-z-modal);
    background: var(--el-bg-color-page);
    padding: 12px 16px;
    overflow-y: auto;
}

.mobile-search__close {
    flex-shrink: 0;
    width: 56px;
    border: none;
    background: var(--el-color-primary);
    color: var(--app-on-accent);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}

.mobile-search__close:active {
    background: var(--app-primary-btn-active);
}
</style>
