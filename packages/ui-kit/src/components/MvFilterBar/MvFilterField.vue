<script setup lang="ts">
defineProps<{ label: string }>();
</script>

<template>
    <div class="mv-filter-field">
        <label class="mv-filter-field__label">{{ label }}</label>
        <slot />
    </div>
</template>

<style scoped>
.mv-filter-field {
    min-width: 0;
}

.mv-filter-field__label {
    display: block;
    margin-bottom: 6px;
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 800;
}
</style>
