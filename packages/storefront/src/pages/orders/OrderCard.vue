<script setup lang="ts">
import { computed } from 'vue';
import type { OrderSummary } from './useOrders';
import { STATUS_LABEL, STATUS_VARIANT } from './useOrders';

const props = defineProps<{ order: OrderSummary }>();

const statusKey = computed(() => props.order.customFields.erpStatus ?? 'PENDING');
const statusLabel = computed(() => STATUS_LABEL[statusKey.value] ?? statusKey.value);
const statusVariant = computed(() => STATUS_VARIANT[statusKey.value] ?? 'default');

const formattedTotal = computed(() => {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(
        props.order.totalWithTax / 100,
    ) + ' ' + (props.order.currencyCode === 'RUB' ? '₽' : props.order.currencyCode);
});

const meta = computed(() => {
    const date = new Date(props.order.createdAt).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
    const addr = props.order.shippingAddress?.streetLine1 ?? '';
    const count = props.order.lines.length;
    return [date, addr, `${count} item${count !== 1 ? 's' : ''}`].filter(Boolean).join(' · ');
});

const preview = computed(() => {
    const names = props.order.lines.slice(0, 3).map(l => l.productVariant.product.name);
    const rest = props.order.lines.length - names.length;
    return rest > 0 ? `${names.join(', ')} and ${rest} more` : names.join(', ');
});
</script>

<template>
    <article class="order-card">
        <div class="order-card-head">
            <div>
                <div class="order-title">Order {{ order.code }}</div>
                <div class="order-meta">{{ meta }}</div>
            </div>
            <span class="status-pill" :class="statusVariant !== 'default' ? statusVariant : ''">
                {{ statusLabel }}
            </span>
            <div class="order-pay">
                <div class="order-sum">{{ formattedTotal }}</div>
            </div>
        </div>
        <div class="order-card-body">
            <div class="order-preview">
                <div class="order-thumb">📦</div>
                <div>{{ preview }}</div>
            </div>
            <div class="order-card-actions">
                <button class="small-btn primary">Open</button>
                <button class="small-btn">Repeat</button>
                <button class="small-btn">Documents</button>
            </div>
        </div>
    </article>
</template>

<style scoped>
.order-card {
    background: #fff;
    border: 1px solid rgba(221, 231, 226, 0.9);
    border-radius: 28px;
    box-shadow: 0 14px 36px rgba(27, 45, 38, 0.08);
    overflow: hidden;
}

.order-card-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 200px 160px;
    gap: 14px;
    align-items: center;
    padding: 18px 20px;
    border-bottom: 1px solid #edf2ef;
}

.order-title {
    font-size: 18px;
    font-weight: 950;
    letter-spacing: -0.035em;
    margin-bottom: 5px;
}

.order-meta {
    color: #66736e;
    font-size: 13px;
    line-height: 1.38;
}

.order-pay { text-align: right; }

.order-sum {
    font-size: 21px;
    font-weight: 950;
    letter-spacing: -0.045em;
}

.status-pill {
    display: inline-flex;
    min-height: 30px;
    align-items: center;
    justify-content: center;
    padding: 0 10px;
    border-radius: 999px;
    background: #e2f8ef;
    color: #008a64;
    font-size: 13px;
    font-weight: 950;
    white-space: nowrap;
}

.status-pill.muted { background: #eef4f1; color: #5f6e68; }
.status-pill.warning { background: #fff4e3; color: #a45e00; }
.status-pill.error { background: #ffeeed; color: #c0362c; }

.order-card-body {
    padding: 16px 20px 18px;
    display: grid;
    gap: 14px;
}

.order-preview {
    display: flex;
    align-items: center;
    gap: 10px;
    color: #66736e;
    font-size: 13px;
    line-height: 1.35;
}

.order-thumb {
    width: 46px;
    height: 46px;
    border-radius: 14px;
    background: linear-gradient(145deg, #f7fbfa, #e8f6ef);
    display: grid;
    place-items: center;
    font-size: 23px;
    flex: 0 0 auto;
    border: 1px solid #edf2ef;
}

.order-card-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
}

.small-btn {
    border: 0;
    min-height: 38px;
    border-radius: 12px;
    padding: 0 13px;
    background: #f3f8f6;
    color: #263732;
    font-weight: 950;
    font-family: inherit;
    cursor: pointer;
    transition: 0.14s ease;
}

.small-btn:hover { background: #e4f0eb; }
.small-btn.primary { background: #00a878; color: #fff; }
.small-btn.primary:hover { background: #008a64; }

@media (max-width: 760px) {
    .order-card-head { grid-template-columns: 1fr; }
    .order-pay { text-align: left; }
    .order-card-actions { justify-content: flex-start; }
}
</style>
