<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvAmountDisplay } from '@mivend/ui-kit';
import { toMajor, type CurrencyTotals } from './useSettlementDocuments';

defineProps<{ totals: CurrencyTotals[] }>();
const { t } = useI18n();
</script>

<template>
    <div class="settlement-cards">
        <div v-for="total in totals" :key="total.currency" class="settlement-cards__group">
            <div class="settlement-cards__card">
                <div class="settlement-cards__label">{{ t('settlements.cards.opening') }}</div>
                <MvAmountDisplay
                    :amount="toMajor(total.openingBalance)"
                    :currency="total.currency"
                    :decimals="2"
                    size="lg"
                />
            </div>
            <div class="settlement-cards__card">
                <div class="settlement-cards__label">{{ t('settlements.cards.current') }}</div>
                <MvAmountDisplay
                    :amount="toMajor(total.currentBalance)"
                    :currency="total.currency"
                    :decimals="2"
                    size="lg"
                />
            </div>
            <div class="settlement-cards__card" :class="{ 'is-overdue': total.overdue > 0 }">
                <div class="settlement-cards__label">{{ t('settlements.cards.overdue') }}</div>
                <MvAmountDisplay
                    :amount="toMajor(total.overdue)"
                    :currency="total.currency"
                    :decimals="2"
                    size="lg"
                />
            </div>
        </div>
    </div>
</template>

<style scoped>
.settlement-cards {
    display: grid;
    gap: 12px;
}

.settlement-cards__group {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
}

.settlement-cards__card {
    background: #fff;
    border: 1px solid rgba(221, 231, 226, 0.86);
    border-radius: 24px;
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
    padding: 18px 20px;
    display: grid;
    gap: 6px;
}

.settlement-cards__label {
    color: #66736e;
    font-size: 13px;
    font-weight: 800;
}

.is-overdue .settlement-cards__label {
    color: #c0362c;
}

@media (max-width: 760px) {
    .settlement-cards__group {
        grid-template-columns: 1fr;
    }
}
</style>
