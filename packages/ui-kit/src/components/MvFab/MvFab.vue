<script setup lang="ts">
// aria-label is intentionally not a declared prop — it's passed through as a plain HTML
// attribute (Vue's default attribute fallthrough) so it lands on whichever root element
// (RouterLink or button) actually renders, without a naming clash between the reserved
// `aria-label` DOM attribute and a camelCase Vue prop of the same meaning.
withDefaults(defineProps<{ to?: string }>(), { to: undefined });
defineEmits<{ click: [] }>();
</script>

<template>
    <RouterLink v-if="to" class="mv-fab" :to="to">
        <span class="mv-fab__icon">+</span>
    </RouterLink>
    <button v-else type="button" class="mv-fab" @click="$emit('click')">
        <span class="mv-fab__icon">+</span>
    </button>
</template>

<style scoped>
.mv-fab {
    position: fixed;
    right: 16px;
    bottom: calc(78px + env(safe-area-inset-bottom));
    z-index: 48;
    width: 54px;
    height: 54px;
    border: 0;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: var(--el-color-primary, #00a884);
    color: #fff;
    text-decoration: none;
    box-shadow: 0 10px 28px rgba(0, 168, 132, 0.34);
    cursor: pointer;
}

.mv-fab:active {
    transform: scale(0.96);
}

.mv-fab__icon {
    font-size: 30px;
    line-height: 1;
    transform: translateY(-1px);
}
</style>
