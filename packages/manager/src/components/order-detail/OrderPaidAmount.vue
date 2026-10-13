<script setup lang="ts">
defineProps<{ paid: string; total: string }>();
</script>

<template>
    <span
        title="Lower bound: sales documents may post with an empty deal in the ERP, so the real amount can be higher."
        data-testid="order-paid"
    >
        Paid per ERP (at least): {{ paid }} of {{ total }}
    </span>
</template>
