<script setup lang="ts">
import { useRouter } from 'vue-router';
import { MvStatusBadge } from '@mivend/ui-kit';
import type { StatusBadgeVariant } from '@mivend/ui-kit';

export interface AttentionEntry {
    customerId: string;
    title: string;
    meta: string;
    tag: string;
    variant: StatusBadgeVariant;
}

defineProps<{ items: AttentionEntry[] }>();
const router = useRouter();
</script>

<template>
    <ul class="needs-attention">
        <li v-if="!items.length" class="needs-attention__empty">Nothing needs attention right now</li>
        <li
            v-for="item in items"
            :key="`${item.customerId}-${item.tag}`"
            class="needs-attention__row"
            @click="router.push(`/customers/${item.customerId}`)"
        >
            <div class="needs-attention__main">
                <div class="needs-attention__title">{{ item.title }}</div>
                <div class="needs-attention__meta">{{ item.meta }}</div>
            </div>
            <MvStatusBadge :variant="item.variant">{{ item.tag }}</MvStatusBadge>
        </li>
    </ul>
</template>

<style scoped>
.needs-attention {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
}

.needs-attention__row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 13px 0;
    border-bottom: 1px solid var(--el-border-color, #e4e7ec);
    cursor: pointer;
}

.needs-attention__row:last-child {
    border-bottom: 0;
    padding-bottom: 0;
}

.needs-attention__main {
    display: grid;
    gap: 4px;
    min-width: 0;
}

.needs-attention__title {
    font-weight: 700;
    font-size: 13px;
}

.needs-attention__meta {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 12px;
    line-height: 1.35;
}

.needs-attention__empty {
    font-size: 13px;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
