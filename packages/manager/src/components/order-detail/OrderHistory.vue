<script setup lang="ts">
import { formatDateTime } from '../../i18n/format';
import { computed } from 'vue';
import { IconCheck } from '@tabler/icons-vue';
import type { OrderDetail } from '../../api/orderDetail';

const props = defineProps<{ history: OrderDetail['statusHistory'] }>();

const entries = computed(() => [...props.history].reverse());

function date(iso: string): string {
    return formatDateTime(iso);
}
</script>

<template>
    <section v-if="entries.length" class="order-history" data-testid="order-history">
        <h2 class="order-history__title">History</h2>
        <ol class="order-history__list">
            <li v-for="entry in entries" :key="entry.uuid" class="order-history__item">
                <span class="order-history__dot"><IconCheck :size="14" /></span>
                <div>
                    <div class="order-history__status">
                        {{ entry.reference?.name ?? entry.status }}
                    </div>
                    <div v-if="entry.reference?.description" class="order-history__note">
                        {{ entry.reference.description }}
                    </div>
                    <div class="order-history__date">{{ date(entry.occurredAt) }}</div>
                </div>
            </li>
        </ol>
    </section>
</template>

<style scoped>
.order-history__title {
    margin: 0 0 14px;
    font-size: 18px;
    font-weight: 900;
}

.order-history__list {
    list-style: none;
    margin: 0;
    padding: 0;
}

.order-history__item {
    position: relative;
    display: flex;
    gap: 14px;
    padding-bottom: 16px;
}

.order-history__item:not(:last-child)::before {
    content: '';
    position: absolute;
    left: 11px;
    top: 24px;
    bottom: 0;
    width: 2px;
    background: var(--app-nav-border-strong);
}

.order-history__dot {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--app-ok-bg);
    color: var(--app-ok-fg);
}

.order-history__status {
    font-weight: 700;
}

.order-history__note,
.order-history__date {
    color: var(--app-text-grey);
    font-size: 12px;
}
</style>
