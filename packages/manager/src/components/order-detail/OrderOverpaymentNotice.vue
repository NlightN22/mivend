<script setup lang="ts">
import { MvNotice } from '@mivend/ui-kit';

defineProps<{ amount: string }>();
</script>

<template>
    <MvNotice variant="warning" data-testid="order-overpayment">
        <strong>Overpaid by {{ amount }}.</strong>
        The order total is now lower than what was paid. mivend does not refund it: the amount stays
        on the customer's balance in the ERP as an advance and is offset against the next sales
        invoice.
    </MvNotice>
</template>
