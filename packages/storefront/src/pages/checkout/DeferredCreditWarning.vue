<script setup lang="ts">
import { computed } from 'vue';
import { MvCheckbox } from '@mivend/ui-kit';
import { useCheckoutStore } from '../../stores/checkout';
import { useCurrency } from '../../composables/useCurrency';

const checkoutStore = useCheckoutStore();
const { formatWhole } = useCurrency();

const preview = computed(() => checkoutStore.creditPreview);
</script>

<template>
    <MvNotice v-if="checkoutStore.creditWarningVisible && preview" variant="warning">
        <p class="deferred-credit-warning__text">
            This order exceeds your available credit:
            {{ formatWhole(preview.orderAmount) }} ordered,
            {{ formatWhole(Math.max(preview.availableCredit, 0)) }} available.
        </p>
        <MvCheckbox
            v-model="checkoutStore.creditAcknowledged"
            label="Understanding that the credit limits are exceeded, manager confirmation is required"
        />
    </MvNotice>
</template>

<style scoped>
.deferred-credit-warning__text {
    margin: 0 0 10px;
}
</style>
