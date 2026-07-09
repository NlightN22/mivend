<script setup lang="ts">
import { useRouter } from 'vue-router';

export interface ExpiringDiscount {
    id: string;
    customerName: string;
    validTo: string;
}

const props = defineProps<{ discounts: ExpiringDiscount[] }>();
const router = useRouter();
</script>

<template>
    <div v-if="props.discounts.length" class="expiring-banner">
        <span class="expiring-banner__icon">⚠</span>
        <div class="expiring-banner__body">
            <strong>Discounts expiring soon</strong>
            <ul>
                <li v-for="discount in props.discounts.slice(0, 3)" :key="discount.id">
                    {{ discount.customerName }} — expires {{ new Date(discount.validTo).toLocaleDateString('en-US') }}
                </li>
            </ul>
        </div>
        <button type="button" class="expiring-banner__action" @click="router.push('/discounts')">
            View discounts
        </button>
    </div>
</template>

<style scoped>
.expiring-banner {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 16px;
}

.expiring-banner__icon {
    color: #b45309;
    font-size: 18px;
}

.expiring-banner__body {
    flex: 1;
    font-size: 13px;
    color: #92400e;
}

.expiring-banner__body ul {
    margin: 4px 0 0;
    padding-left: 18px;
}

.expiring-banner__action {
    background: none;
    border: 1px solid #b45309;
    color: #b45309;
    border-radius: 4px;
    padding: 4px 10px;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
}
</style>
