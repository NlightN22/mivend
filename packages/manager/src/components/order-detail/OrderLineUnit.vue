<script setup lang="ts">
defineProps<{ unit: string }>();
</script>

<template>
    <small v-if="unit" class="line-unit" data-testid="line-unit">{{ unit }}</small>
</template>

<style scoped>
.line-unit {
    display: block;
    margin-top: 2px;
    color: var(--app-text-grey);
    font-size: 11px;
    line-height: 1.2;
}
</style>
