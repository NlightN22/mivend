<script setup lang="ts">
import type { LineBonus } from '../../composables/useOrderRetroBonus';

defineProps<{ bonus: LineBonus | null; money: (amount: number) => string }>();
</script>

<template>
    <span v-if="bonus" class="line-bonus">
        {{ bonus.percent }}%
        <span v-if="bonus.amount !== null" class="line-bonus__amount">{{
            money(bonus.amount)
        }}</span>
    </span>
    <span v-else>—</span>
</template>

<style scoped>
.line-bonus {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
}

.line-bonus__amount {
    color: var(--app-text-grey);
    font-size: 12px;
}
</style>
