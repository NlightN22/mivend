<script setup lang="ts">
import { IconHeart, IconHeartFilled } from '@tabler/icons-vue';

interface Props {
    isFavorited?: boolean;
    overlay?: boolean;
    ariaLabel?: string;
}

withDefaults(defineProps<Props>(), {
    isFavorited: false,
    overlay: false,
    ariaLabel: 'Toggle favorite',
});

const emit = defineEmits<{
    toggle: [];
}>();
</script>

<template>
    <button
        class="mv-favorite-btn"
        :class="{
            'mv-favorite-btn--active': isFavorited,
            'mv-favorite-btn--overlay': overlay,
        }"
        type="button"
        :aria-label="ariaLabel"
        @click="emit('toggle')"
    >
        <template v-if="overlay">
            <IconHeartFilled v-if="isFavorited" :size="22" />
            <IconHeart v-else :size="22" :stroke-width="1.8" />
        </template>
        <template v-else>{{ isFavorited ? '♥' : '♡' }}</template>
    </button>
</template>

<style scoped>
.mv-favorite-btn {
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 50%;
    background: var(--app-surface);
    color: var(--app-text-disabled);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    transition:
        color 0.15s,
        background 0.15s;
}
.mv-favorite-btn:hover {
    background: var(--app-row-hover);
}
.mv-favorite-btn--active {
    color: var(--app-danger-btn);
}
.mv-favorite-btn--overlay {
    background: transparent;
    color: var(--app-nav-label);
    filter: drop-shadow(0 0 2px var(--app-surface)) drop-shadow(0 0 1px var(--app-surface));
}
.mv-favorite-btn--overlay:hover {
    background: transparent;
    color: var(--app-danger-btn);
}
.mv-favorite-btn--overlay.mv-favorite-btn--active {
    color: var(--app-danger-btn);
}
</style>
