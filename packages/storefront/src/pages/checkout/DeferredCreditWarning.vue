<script setup lang="ts">
import { MvCheckbox } from '@mivend/ui-kit';
import { useCheckoutStore } from '../../stores/checkout';

const checkoutStore = useCheckoutStore();
</script>

<template>
    <div v-if="checkoutStore.creditWarningVisible" class="deferred-credit-warning">
        <MvCheckbox
            v-model="checkoutStore.creditAcknowledged"
            label="I understand the limit is exceeded"
        />
    </div>
</template>

<style scoped>
.deferred-credit-warning {
    padding: 12px 14px;
    border-radius: 14px;
    background: #fff4e0;
    font-size: 14px;
}
</style>
