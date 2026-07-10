<script setup lang="ts">
import { MvStatusBadge } from '@mivend/ui-kit';
import type { RelatedDocument } from '../../api/orderDetail';

defineProps<{ documents: RelatedDocument[] }>();

function variant(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
    if (status === 'ready') return 'success';
    if (status === 'failed') return 'danger';
    if (status === 'generating') return 'warning';
    return 'neutral';
}
</script>

<template>
    <ul class="related-documents">
        <li v-if="!documents.length" class="related-documents__empty">No documents for this order</li>
        <li v-for="doc in documents" :key="doc.id" class="related-documents__item">
            <RouterLink to="/documents" class="related-documents__link">
                {{ doc.type }} · {{ doc.number }}
            </RouterLink>
            <MvStatusBadge :variant="variant(doc.status)">{{ doc.status }}</MvStatusBadge>
        </li>
    </ul>
</template>

<style scoped>
.related-documents {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.related-documents__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 13px;
}

.related-documents__link {
    color: var(--el-text-color-primary, #17212b);
    text-decoration: none;
    font-weight: 600;
}

.related-documents__link:hover {
    color: var(--el-color-primary-dark-2, #008a70);
}

.related-documents__empty {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}
</style>
