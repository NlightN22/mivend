<script setup lang="ts">
import PaymentsList from '../../components/payments/PaymentsList.vue';
</script>

<template>
    <div class="payments-page">
        <div class="payments-page__header">
            <div class="payments-page__breadcrumb">Workspace / Payments</div>
            <h1 class="payments-page__title">Payments</h1>
        </div>

        <PaymentsList />
    </div>
</template>

<style scoped>
.payments-page__header {
    margin-bottom: 14px;
}

.payments-page__breadcrumb {
    color: var(--app-text-grey);
    font-size: 13px;
    margin-bottom: 6px;
}

.payments-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

@media (max-width: 800px) {
    .payments-page__breadcrumb {
        display: none;
    }

    .payments-page__title {
        font-size: 22px;
    }
}
</style>
