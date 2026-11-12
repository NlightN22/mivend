<script setup lang="ts">
import DiscountsWorkspace from '../discounts/DiscountsWorkspace.vue';

defineProps<{ counterpartyId: string }>();
</script>

<template>
    <DiscountsWorkspace :counterparty-id="counterpartyId" url-prefix="discounts." />
</template>
