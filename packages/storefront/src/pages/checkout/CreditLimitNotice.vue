<script setup lang="ts">
import { MvCheckbox } from '@mivend/ui-kit';
import { useCheckoutStore } from '../../stores/checkout';

const checkoutStore = useCheckoutStore();
</script>

<template>
    <div v-if="checkoutStore.creditWarningVisible" class="deferred-credit-warning">
        <p v-if="checkoutStore.waitsForManagerConfirmation" class="deferred-credit-warning__note">
            {{ $t('checkout.credit.waitsForManager') }}
        </p>
        <MvCheckbox
            v-model="checkoutStore.creditAcknowledged"
            :label="$t('checkout.credit.acknowledge')"
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

.deferred-credit-warning__note {
    margin: 0 0 8px;
}
</style>
