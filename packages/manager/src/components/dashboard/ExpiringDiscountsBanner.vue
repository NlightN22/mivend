<script setup lang="ts">
import { MvWarningBanner } from '@mivend/ui-kit';

export interface ExpiringDiscount {
    id: string;
    customerName: string;
    validTo: string;
}

const props = defineProps<{ discounts: ExpiringDiscount[] }>();
</script>

<template>
    <MvWarningBanner v-if="props.discounts.length" action-text="View discounts" action-to="/discounts">
        <strong>Discounts expiring soon</strong>
        <ul>
            <li v-for="discount in props.discounts.slice(0, 3)" :key="discount.id">
                {{ discount.customerName }} — expires {{ new Date(discount.validTo).toLocaleDateString('en-US') }}
            </li>
        </ul>
    </MvWarningBanner>
</template>
