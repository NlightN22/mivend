<script setup lang="ts">
import { MvStatusBadge } from '@mivend/ui-kit';
import type { NotificationItem } from '@mivend/ui-kit';

defineProps<{ notifications: NotificationItem[] }>();
</script>

<template>
    <ul class="payment-reconciliation">
        <li v-if="!notifications.length" class="payment-reconciliation__empty">
            No open payment issues
        </li>
        <li
            v-for="notification in notifications.slice(0, 5)"
            :key="notification.id"
            class="payment-reconciliation__item"
        >
            <div class="payment-reconciliation__main">
                <span class="payment-reconciliation__title">{{ notification.title }}</span>
                <span class="payment-reconciliation__detail">{{ notification.message }}</span>
            </div>
            <MvStatusBadge variant="warning">{{ notification.status }}</MvStatusBadge>
        </li>
    </ul>
</template>

<style scoped>
.payment-reconciliation {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.payment-reconciliation__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    font-size: 13px;
}

.payment-reconciliation__main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.payment-reconciliation__title {
    color: #111827;
    font-weight: 600;
}

.payment-reconciliation__detail {
    color: #6b7280;
    font-size: 12px;
}

.payment-reconciliation__empty {
    color: #6b7280;
    font-size: 13px;
    padding: 10px 12px;
}
</style>
