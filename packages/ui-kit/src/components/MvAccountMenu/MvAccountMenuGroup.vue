<script setup lang="ts">
import type { Component } from 'vue';
import { IconChevronDown } from '@tabler/icons-vue';

defineProps<{
    id: string;
    label: string;
    open: boolean;
    icon?: Component;
    current?: string;
}>();
const emit = defineEmits<{ toggle: [] }>();
</script>

<template>
    <button
        type="button"
        class="mv-account-menu__item"
        :class="{ 'mv-account-menu__item--open': open }"
        :aria-expanded="open"
        :aria-controls="id"
        @click="emit('toggle')"
    >
        <component
            :is="icon"
            v-if="icon"
            :size="20"
            class="mv-account-menu__icon"
            aria-hidden="true"
        />
        <span class="mv-account-menu__label">{{ label }}</span>
        <span v-if="current" class="mv-account-menu__current">{{ current }}</span>
        <IconChevronDown
            :size="16"
            class="mv-account-menu__chevron"
            :class="{ 'mv-account-menu__chevron--open': open }"
            aria-hidden="true"
        />
    </button>
    <div v-if="open" :id="id" class="mv-account-menu__sub">
        <slot />
    </div>
</template>
