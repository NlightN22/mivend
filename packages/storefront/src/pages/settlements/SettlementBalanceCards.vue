<script setup lang="ts">
import { MvAmountDisplay } from '@mivend/ui-kit';
import { toMajor, type CurrencyTotals } from './useSettlementDocuments';

defineProps<{ totals: CurrencyTotals[] }>();
</script>

<template>
    <div class="settlement-cards">
        <div v-for="t in totals" :key="t.currency" class="settlement-cards__group">
            <div class="settlement-cards__card">
                <div class="settlement-cards__label">Opening balance</div>
                <MvAmountDisplay
                    :amount="toMajor(t.openingBalance)"
                    :currency="t.currency"
                    :decimals="2"
                    size="lg"
                />
            </div>
            <div class="settlement-cards__card">
                <div class="settlement-cards__label">Current balance</div>
                <MvAmountDisplay
                    :amount="toMajor(t.currentBalance)"
                    :currency="t.currency"
                    :decimals="2"
                    size="lg"
                />
            </div>
            <div class="settlement-cards__card" :class="{ 'is-overdue': t.overdue > 0 }">
                <div class="settlement-cards__label">Overdue</div>
                <MvAmountDisplay
                    :amount="toMajor(t.overdue)"
                    :currency="t.currency"
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
