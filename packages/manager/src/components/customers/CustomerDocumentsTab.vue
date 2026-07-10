<script setup lang="ts">
import { MvStatusBadge } from '@mivend/ui-kit';
import type { CustomerDocument } from '../../api/customers';

defineProps<{ documents: CustomerDocument[] }>();

function variant(status: string): 'success' | 'warning' | 'danger' | 'neutral' {
    if (status === 'ready') return 'success';
    if (status === 'failed') return 'danger';
    if (status === 'generating') return 'warning';
    return 'neutral';
}
</script>

<template>
    <ul class="customer-documents">
        <li v-if="!documents.length" class="customer-documents__empty">No documents for this customer</li>
        <li v-for="doc in documents" :key="doc.id">
            <RouterLink to="/documents" class="customer-documents__link">{{ doc.type }} · {{ doc.number }}</RouterLink>
            <MvStatusBadge :variant="variant(doc.status)">{{ doc.status }}</MvStatusBadge>
        </li>
    </ul>
</template>

<style scoped>
.customer-documents {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.customer-documents li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 13px;
}

.customer-documents__link {
    color: var(--el-text-color-primary, #17212b);
    text-decoration: none;
    font-weight: 600;
}

.customer-documents__link:hover {
    color: var(--el-color-primary-dark-2, #008a70);
}

.customer-documents__empty {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 13px;
}
</style>
