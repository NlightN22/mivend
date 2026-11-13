<script setup lang="ts">
import DiscountsWorkspace from '../discounts/DiscountsWorkspace.vue';

defineProps<{ counterpartyId: string; counterpartyName: string }>();
</script>

<template>
    <DiscountsWorkspace :counterparty-id="counterpartyId"
        :counterparty-name="counterpartyName"
        url-prefix="discounts." />
</template>
