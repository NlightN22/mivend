<script setup lang="ts">
import { IconHeart, IconHeartFilled } from '@tabler/icons-vue';

interface Props {
    isFavorited?: boolean;
    overlay?: boolean;
}

withDefaults(defineProps<Props>(), {
    isFavorited: false,
    overlay: false,
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
        aria-label="Toggle favorite"
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
    background: #fff;
    color: #b4ccc4;
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
    background: #f4f9f7;
}
.mv-favorite-btn--active {
    color: #ff4d6d;
}
.mv-favorite-btn--overlay {
    background: transparent;
    color: #4a5b54;
    filter: drop-shadow(0 0 2px #fff) drop-shadow(0 0 1px #fff);
}
.mv-favorite-btn--overlay:hover {
    background: transparent;
    color: #ff4d6d;
}
.mv-favorite-btn--overlay.mv-favorite-btn--active {
    color: #ff4d6d;
}
</style>
