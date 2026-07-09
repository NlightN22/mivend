<script setup lang="ts">
// Small circular counter badge — e.g. pending-approvals count next to a nav item.
defineProps<{ count: number }>();
</script>

<template>
    <span v-if="count > 0" class="mv-count-badge">{{ count }}</span>
</template>

<style scoped>
.mv-count-badge {
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 999px;
    background: #fee2e2;
    color: #dc2626;
    display: grid;
    place-items: center;
    font-size: 12px;
    font-weight: 800;
}
</style>
