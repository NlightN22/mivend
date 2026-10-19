<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { IconCheck, IconChevronDown } from '@tabler/icons-vue';
import 'flag-icons/css/flag-icons.min.css';

export interface LanguageOption {
    code: string;
    nativeName: string;
    flagRegion: string;
}

const props = withDefaults(
    defineProps<{
        modelValue: string;
        options: LanguageOption[];
        ariaLabel?: string;
    }>(),
    { ariaLabel: 'Language' },
);

const emit = defineEmits<{ 'update:modelValue': [code: string] }>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);

const activeCode = computed(() => props.modelValue.toUpperCase());

function select(code: string): void {
    open.value = false;
    if (code !== props.modelValue) emit('update:modelValue', code);
}

function onDocumentPointer(event: PointerEvent): void {
    if (!root.value?.contains(event.target as Node)) open.value = false;
}

function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') open.value = false;
}

watch(open, isOpen => {
    if (isOpen) {
        document.addEventListener('pointerdown', onDocumentPointer);
        document.addEventListener('keydown', onKeydown);
    } else {
        document.removeEventListener('pointerdown', onDocumentPointer);
        document.removeEventListener('keydown', onKeydown);
    }
});

onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDocumentPointer);
    document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
    <div ref="root" class="mv-lang">
        <button
            type="button"
            class="mv-lang__trigger"
            :class="{ 'mv-lang__trigger--open': open }"
            :aria-label="ariaLabel"
            aria-haspopup="listbox"
            :aria-expanded="open"
            data-testid="language-switcher"
            @click="open = !open"
        >
            <span>{{ activeCode }}</span>
            <IconChevronDown :size="14" stroke-width="2" class="mv-lang__chevron" />
        </button>
        <ul v-if="open" class="mv-lang__menu" role="listbox" :aria-label="ariaLabel">
            <li
                v-for="option in options"
                :key="option.code"
                role="option"
                :aria-selected="option.code === modelValue"
                :data-locale="option.code"
                class="mv-lang__option"
                :class="{ 'mv-lang__option--active': option.code === modelValue }"
                tabindex="0"
                @click="select(option.code)"
                @keydown.enter.prevent="select(option.code)"
                @keydown.space.prevent="select(option.code)"
            >
                <span
                    :class="['fi', `fi-${option.flagRegion}`, 'mv-lang__flag']"
                    aria-hidden="true"
                />
                <span class="mv-lang__code">{{ option.code.toUpperCase() }}</span>
                <span class="mv-lang__name" :lang="option.code">{{ option.nativeName }}</span>
                <IconCheck
                    v-if="option.code === modelValue"
                    :size="16"
                    stroke-width="2.4"
                    class="mv-lang__check"
                />
            </li>
        </ul>
    </div>
</template>

<style scoped>
.mv-lang {
    position: relative;
}

.mv-lang__trigger {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 40px;
    padding: 0 10px;
    border: none;
    border-radius: 12px;
    background: transparent;
    color: #66736e;
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    transition:
        background 0.14s,
        color 0.14s;
}

.mv-lang__trigger:hover,
.mv-lang__trigger--open {
    background: #f4faf7;
    color: #008a64;
}

.mv-lang__trigger:active {
    background: #e2f8ef;
}

.mv-lang__trigger:focus-visible,
.mv-lang__option:focus-visible {
    outline: 2px solid #00b894;
    outline-offset: 2px;
}

.mv-lang__chevron {
    transition: transform 0.14s;
}

.mv-lang__trigger--open .mv-lang__chevron {
    transform: rotate(180deg);
}

.mv-lang__menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: var(--mv-z-dropdown);
    min-width: 200px;
    margin: 0;
    padding: 6px;
    list-style: none;
    background: #fff;
    border: 1px solid #e3ebe7;
    border-radius: 12px;
    box-shadow: 0 12px 32px rgba(20, 35, 31, 0.14);
}

.mv-lang__option {
    display: grid;
    grid-template-columns: 22px 28px 1fr 16px;
    align-items: center;
    gap: 8px;
    padding: 9px 10px;
    border-radius: 8px;
    color: #14231f;
    font-size: 14px;
    cursor: pointer;
}

.mv-lang__option:hover {
    background: #f4faf7;
}

.mv-lang__option--active {
    font-weight: 600;
}

.mv-lang__flag {
    width: 22px;
    height: 16px;
    border-radius: 3px;
    background-size: cover;
    box-shadow: 0 0 0 1px rgba(20, 35, 31, 0.08);
}

.mv-lang__code {
    color: #66736e;
    font-size: 12px;
    font-weight: 700;
}

.mv-lang__check {
    color: #00b894;
}
</style>
