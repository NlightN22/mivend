<script setup lang="ts">
import { computed } from 'vue';
import SettlementsList from '../../components/settlements/SettlementsList.vue';
import { useAuthStore } from '../../stores/auth';

const authStore = useAuthStore();
const canReadPayments = computed(() => authStore.hasPermission('ReadPayment'));
</script>

<template>
    <div class="settlements-page">
        <div class="settlements-page__header">
            <div class="settlements-page__breadcrumb">Workspace / Settlements</div>
            <div class="settlements-page__title-row">
                <h1 class="settlements-page__title">Settlements</h1>
                <RouterLink
                    v-if="canReadPayments"
                    to="/payments"
                    class="settlements-page__payments-link"
                >
                    Online payments
                </RouterLink>
            </div>
        </div>

        <SettlementsList />
    </div>
</template>

<style scoped>
.settlements-page__header {
    margin-bottom: 14px;
}

.settlements-page__breadcrumb {
    color: var(--app-text-grey);
    font-size: 13px;
    margin-bottom: 6px;
}

.settlements-page__title-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
}

.settlements-page__payments-link {
    color: var(--app-text-body2);
    font-size: 14px;
    text-decoration: underline;
}

.settlements-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

@media (max-width: 800px) {
    .settlements-page__breadcrumb {
        display: none;
    }

    .settlements-page__title {
        font-size: 22px;
    }
}
</style>
