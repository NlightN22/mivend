<script setup lang="ts">
import { useRouter } from 'vue-router';

export interface AttentionItem {
    code: string;
    title: string;
    meta: string;
}

defineProps<{ items: AttentionItem[] }>();
const router = useRouter();
</script>

<template>
    <ul class="attention-list">
        <li v-if="!items.length" class="attention-list__empty">Nothing needs attention right now</li>
        <li
            v-for="item in items"
            :key="item.code"
            class="attention-list__item"
            @click="router.push(`/orders/${item.code}`)"
        >
            <span class="attention-list__dot" />
            <div>
                <div class="attention-list__title">{{ item.title }}</div>
                <div class="attention-list__meta">{{ item.meta }}</div>
            </div>
        </li>
    </ul>
</template>

<style scoped>
.attention-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.attention-list__item {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    cursor: pointer;
}

.attention-list__dot {
    width: 8px;
    height: 8px;
    margin-top: 6px;
    border-radius: 50%;
    background: #dc2626;
    flex-shrink: 0;
}

.attention-list__title {
    font-size: 13px;
    font-weight: 700;
    color: var(--el-text-color-primary, #17212b);
}

.attention-list__meta {
    font-size: 12px;
    color: var(--el-text-color-secondary, #6b7280);
}

.attention-list__empty {
    font-size: 13px;
    color: var(--el-text-color-secondary, #6b7280);
}
</style>
