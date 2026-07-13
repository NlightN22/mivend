<script setup lang="ts">
import { useRouter } from 'vue-router';
import { MvStatusBadge } from '@mivend/ui-kit';
import type { DiscountRuleItem } from '../../api/customers';

defineProps<{ discounts: DiscountRuleItem[] }>();
const router = useRouter();

// No exact "expiring soon" threshold has been decided yet (see
// manager-portal-concept.md §8.2, "N не определено") — 14 days is a reasonable placeholder,
// consistent with the same approximation used on the Dashboard.
const EXPIRING_SOON_DAYS = 14;

function status(discount: DiscountRuleItem): { label: string; variant: 'success' | 'warning' | 'neutral' } {
    const now = Date.now();
    const validTo = new Date(discount.validTo).getTime();
    if (validTo < now) return { label: 'Expired', variant: 'neutral' };
    if (validTo - now < EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000) {
        return { label: 'Expiring soon', variant: 'warning' };
    }
    return { label: 'Active', variant: 'success' };
}
</script>

<template>
    <div class="customer-discounts">
        <div class="customer-discounts__header">
            <button type="button" class="customer-discounts__new" @click="router.push('/discounts')">
                New discount grant
            </button>
        </div>
        <ul v-if="discounts.length" class="customer-discounts__list">
            <li v-for="discount in discounts" :key="discount.id">
                <div>
                    <strong>{{ discount.facetValueCode ?? 'All products' }}</strong>
                    <span class="customer-discounts__meta">
                        {{ discount.percent }}% · until {{ new Date(discount.validTo).toLocaleDateString('en-US') }}
                    </span>
                </div>
                <MvStatusBadge :variant="status(discount).variant">{{ status(discount).label }}</MvStatusBadge>
            </li>
        </ul>
        <p v-else class="customer-discounts__empty">No discounts apply to this customer</p>
    </div>
</template>

<style scoped>
.customer-discounts__header {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 12px;
}

.customer-discounts__new {
    background: var(--el-color-primary, #00b894);
    color: #fff;
    border: none;
    border-radius: 999px;
    padding: 6px 14px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
}

.customer-discounts__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.customer-discounts__list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
}

.customer-discounts__meta {
    margin-left: 8px;
    color: var(--el-text-color-secondary, #6b7280);
}

.customer-discounts__empty {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}
</style>
