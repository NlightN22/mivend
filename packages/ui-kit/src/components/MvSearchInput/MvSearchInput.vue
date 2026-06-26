<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import MvSearchDropdown from './MvSearchDropdown.vue';

export type SuggestionGroupType = 'products' | 'brands' | 'oem' | 'vin' | 'analogs' | 'previous';

export interface SuggestionItem {
  id: string;
  label: string;
  subtitle?: string;
}

export interface SuggestionGroup {
  type: SuggestionGroupType;
  label: string;
  items: SuggestionItem[];
}

interface Props {
  modelValue: string;
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
  error?: string;
  suggestions?: SuggestionGroup[];
  collapsed?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Search by article, VIN, brand, OEM, name',
  loading: false,
  disabled: false,
  error: undefined,
  suggestions: undefined,
  collapsed: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  search: [value: string];
  clear: [];
}>();

const isFocused = ref(false);
const expandedOnMobile = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);
const rootRef = ref<HTMLDivElement | null>(null);

const showSuggestions = computed(
  () => isFocused.value && Array.isArray(props.suggestions) && props.suggestions.length > 0,
);

const isEmpty = computed(
  () =>
    isFocused.value &&
    Array.isArray(props.suggestions) &&
    props.suggestions.length === 0 &&
    props.modelValue.length > 0,
);

const isVisible = computed(() => !props.collapsed || expandedOnMobile.value);

function onInput(event: Event): void {
  emit('update:modelValue', (event.target as HTMLInputElement).value);
}

function onSearch(): void {
  if (!props.loading && !props.disabled) {
    emit('search', props.modelValue);
    isFocused.value = false;
  }
}

function onClear(): void {
  emit('update:modelValue', '');
  emit('clear');
  inputRef.value?.focus();
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') onSearch();
  if (event.key === 'Escape') {
    isFocused.value = false;
    inputRef.value?.blur();
  }
}

function selectItem(item: SuggestionItem): void {
  emit('update:modelValue', item.label);
  emit('search', item.label);
  isFocused.value = false;
}

function toggleMobile(): void {
  expandedOnMobile.value = !expandedOnMobile.value;
  if (expandedOnMobile.value) {
    nextTick(() => inputRef.value?.focus());
  }
}

function onDocumentClick(e: MouseEvent): void {
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) {
    isFocused.value = false;
  }
}

onMounted(() => document.addEventListener('click', onDocumentClick));
onUnmounted(() => document.removeEventListener('click', onDocumentClick));
</script>

<template>
  <div ref="rootRef" class="mv-search">
    <button
      v-if="collapsed && !expandedOnMobile"
      class="mv-search__icon-btn"
      aria-label="Open search"
      @click="toggleMobile"
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="9" cy="9" r="6" stroke="currentColor" stroke-width="2" />
        <path d="M13.5 13.5L17 17" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
    </button>

    <template v-if="isVisible">
      <div
        :class="[
          'mv-search__wrap',
          {
            'mv-search__wrap--focused': isFocused,
            'mv-search__wrap--error': !!error,
            'mv-search__wrap--loading': loading,
            'mv-search__wrap--disabled': disabled,
          },
        ]"
      >
        <input
          ref="inputRef"
          class="mv-search__input"
          type="text"
          :value="modelValue"
          :placeholder="placeholder"
          :disabled="disabled"
          autocomplete="off"
          @input="onInput"
          @focus="isFocused = true"
          @keydown="onKeydown"
        />
        <button
          v-if="modelValue && !loading"
          class="mv-search__clear"
          type="button"
          aria-label="Clear"
          @click="onClear"
        >
          ×
        </button>
        <button
          class="mv-search__btn"
          type="button"
          :disabled="disabled"
          @click="onSearch"
        >
          <span v-if="loading" class="mv-search__spinner" aria-hidden="true" />
          <span v-else>Find</span>
        </button>
      </div>

      <p v-if="error" class="mv-search__error">{{ error }}</p>

      <MvSearchDropdown
        v-if="showSuggestions"
        :groups="suggestions!"
        :query="modelValue"
        @select="selectItem"
      />

      <div v-if="isEmpty" class="mv-search__empty">No results found for "{{ modelValue }}"</div>
    </template>
  </div>
</template>

<style scoped>
.mv-search { position: relative; width: 100%; }

.mv-search__icon-btn {
  width: 44px;
  height: 44px;
  border: 1.5px solid #E4E7EC;
  border-radius: 12px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #667085;
}

.mv-search__wrap {
  display: flex;
  height: 52px;
  border: 2.5px solid #E4E7EC;
  border-radius: 16px;
  overflow: hidden;
  background: #fff;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.mv-search__wrap--focused {
  border-color: #00B894;
  box-shadow: 0 0 0 3px rgba(0, 184, 148, 0.12);
}

.mv-search__wrap--error { border-color: #EF4444; }
.mv-search__wrap--error.mv-search__wrap--focused {
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.12);
}

.mv-search__wrap--disabled { opacity: 0.5; pointer-events: none; }

.mv-search__input {
  flex: 1;
  min-width: 0;
  border: none;
  padding: 0 14px;
  font-size: var(--app-font-size-search, 16px);
  font-family: var(--app-font-family, Inter, system-ui, sans-serif);
  color: #17212B;
  background: transparent;
  outline: none;
}

.mv-search__input::placeholder { color: #667085; }

.mv-search__clear {
  width: 32px;
  border: none;
  background: transparent;
  font-size: 18px;
  color: #667085;
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.mv-search__clear:hover { color: #17212B; }

.mv-search__btn {
  min-width: 100px;
  border: none;
  background: #00B894;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
  font-family: var(--app-font-family, Inter, system-ui, sans-serif);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 20px;
  flex-shrink: 0;
  transition: background 0.15s;
}
.mv-search__btn:hover:not(:disabled) { background: #00A884; }
.mv-search__btn:disabled { opacity: 0.6; cursor: not-allowed; }

.mv-search__spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255,255,255,0.4);
  border-top-color: #fff;
  border-radius: 50%;
  animation: mv-spin 0.6s linear infinite;
}
@keyframes mv-spin { to { transform: rotate(360deg); } }

.mv-search__error {
  margin: 6px 2px 0;
  font-size: 13px;
  color: #EF4444;
}

.mv-search__empty {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: #fff;
  border: 1px solid #E4E7EC;
  border-radius: 16px;
  padding: 24px 16px;
  text-align: center;
  font-size: 14px;
  color: #667085;
  box-shadow: 0 10px 28px rgba(16, 24, 40, 0.08);
}
</style>
