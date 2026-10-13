<script setup lang="ts">
defineProps<{ paid: string; total: string; overpaid: string | null }>();
</script>

<template>
    <span
        title="Lower bound: sales documents may post with an empty deal in the ERP, so the real amount can be higher."
        data-testid="order-paid"
    >
        <template v-if="overpaid">Paid in full per ERP (overpaid by {{ overpaid }})</template>
        <template v-else>Paid per ERP (at least): {{ paid }} of {{ total }}</template>
    </span>
</template>
