<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { IconCheck } from '@tabler/icons-vue';
import type { OrderDetail } from './useOrderDetail';
import { formatDate } from './orderFormat';

const props = defineProps<{ history: OrderDetail['statusHistory'] }>();
const { t } = useI18n();

type Entry = OrderDetail['statusHistory'][number];

const entries = computed(() => [...props.history].reverse());

function label(entry: Entry): string {
    return entry.reference?.name ?? entry.status;
}
</script>

<template>
    <div v-if="entries.length" class="oh">
        <h2 class="oh-title">{{ t('orders.detail.history') }}</h2>
        <ol class="oh-list">
            <li v-for="entry in entries" :key="entry.uuid" class="oh-item">
                <span class="oh-dot"><IconCheck :size="14" /></span>
                <div>
                    <div class="oh-status">{{ label(entry) }}</div>
                    <div v-if="entry.reference?.description" class="oh-note">
                        {{ entry.reference.description }}
                    </div>
                    <div class="oh-date">{{ formatDate(entry.occurredAt) }}</div>
                </div>
            </li>
        </ol>
    </div>
</template>

<style scoped>
.oh {
    margin-top: 18px;
    background: #fff;
    border: 1px solid #edf2ef;
    border-radius: 20px;
    padding: 18px 20px;
}
.oh-title {
    margin: 0 0 14px;
    font-size: 20px;
    font-weight: 950;
    letter-spacing: -0.035em;
}
.oh-list {
    list-style: none;
    margin: 0;
    padding: 0;
}
.oh-item {
    position: relative;
    display: flex;
    gap: 14px;
    padding-bottom: 18px;
}
.oh-item:last-child {
    padding-bottom: 0;
}
.oh-item:not(:last-child)::before {
    content: '';
    position: absolute;
    left: 11px;
    top: 26px;
    bottom: 2px;
    width: 2px;
    background: #c9ece0;
}
.oh-dot {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #00a878;
    color: #fff;
}
.oh-status {
    font-size: 14px;
    font-weight: 950;
    color: #1b2d26;
}
.oh-note {
    margin-top: 2px;
    font-size: 13px;
    color: #344640;
}
.oh-date {
    margin-top: 2px;
    font-size: 12px;
    color: #66736e;
}
</style>
