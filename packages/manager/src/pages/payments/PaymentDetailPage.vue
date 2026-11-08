<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { MvErrorState } from '@mivend/ui-kit';
import { formatPaymentAmount } from '../../api/payments';
import { usePaymentCard } from '../../composables/usePaymentCard';
import PaymentCardHeader from '../../components/payment-detail/PaymentCardHeader.vue';
import PaymentCardPanels from '../../components/payment-detail/PaymentCardPanels.vue';
import PaymentRefundsTimeline from '../../components/payment-detail/PaymentRefundsTimeline.vue';

const route = useRoute();
const id = computed(() => String(route.params.id));
const { payment, loading, failed, reload } = usePaymentCard(id);
</script>

<template>
    <MvErrorState
        v-if="failed"
        title="Could not load the payment"
        message="Check the connection and try again."
        @retry="reload"
    />
    <div v-else-if="!loading && !payment" class="payment-detail__not-found">
        <h1>Payment not found</h1>
        <RouterLink to="/payments">Back to payments</RouterLink>
    </div>
    <div v-else-if="payment" class="payment-detail">
        <PaymentCardHeader
            :payment="payment"
            :amount="formatPaymentAmount(payment.amount, payment.currencyCode)"
        />
        <PaymentCardPanels :payment="payment" />
        <PaymentRefundsTimeline :payment="payment" />
    </div>
</template>

<style scoped>
.payment-detail {
    display: flex;
    flex-direction: column;
    gap: 18px;
}
</style>
