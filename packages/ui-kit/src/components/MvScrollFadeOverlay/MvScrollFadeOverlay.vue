<script setup lang="ts">
import MvRoundIconButton from '../MvRoundIconButton/MvRoundIconButton.vue';

defineProps<{
    canScrollLeft: boolean;
    canScrollRight: boolean;
}>();

const emit = defineEmits<{
    'scroll-left': [];
    'scroll-right': [];
}>();
</script>

<template>
    <!-- Absolutely positioned over whatever host renders the actual scrollable element (host
         owns `position: relative` + the scroll container itself — see useHorizontalScrollFade).
         Fades signal "more content this way"; arrows are a click-to-scroll shortcut on top of the
         native scroll, not a replacement for it — both share the same left/right visibility so
         nothing shows once there's nothing left to scroll to. -->
    <div v-if="canScrollLeft" class="mv-scroll-fade-overlay__fade mv-scroll-fade-overlay__fade--left" />
    <div v-if="canScrollRight" class="mv-scroll-fade-overlay__fade mv-scroll-fade-overlay__fade--right" />
    <MvRoundIconButton
        v-if="canScrollLeft"
        :size="32"
        class="mv-scroll-fade-overlay__arrow mv-scroll-fade-overlay__arrow--left"
        aria-label="Scroll left"
        @click="emit('scroll-left')"
    >
        ‹
    </MvRoundIconButton>
    <MvRoundIconButton
        v-if="canScrollRight"
        :size="32"
        class="mv-scroll-fade-overlay__arrow mv-scroll-fade-overlay__arrow--right"
        aria-label="Scroll right"
        @click="emit('scroll-right')"
    >
        ›
    </MvRoundIconButton>
</template>

<style scoped>
.mv-scroll-fade-overlay__fade {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 32px;
    pointer-events: none;
    z-index: 2;
}

.mv-scroll-fade-overlay__fade--left {
    left: 0;
    background: linear-gradient(to right, var(--app-bg, #f6f8fb), transparent);
}

.mv-scroll-fade-overlay__fade--right {
    right: 0;
    background: linear-gradient(to left, var(--app-bg, #f6f8fb), transparent);
}

/* Positioned via `top: calc(50% - half the button's own size)`, not `transform: translateY(-50%)`
   — MvRoundIconButton's own hover state sets `transform: translateY(-2px)` on this same element
   for its lift effect, and `transform` isn't additive across rules: whichever value wins the
   cascade replaces the other outright rather than combining. Centering with `transform` here
   would make hover silently drop the -50% and snap the button to only its -2px hover offset —
   a jump of roughly half the table's height, not a subtle lift. */
.mv-scroll-fade-overlay__arrow {
    position: absolute;
    top: calc(50% - 16px);
    z-index: 3;
}

.mv-scroll-fade-overlay__arrow--left {
    left: 4px;
}

.mv-scroll-fade-overlay__arrow--right {
    right: 4px;
}
</style>
