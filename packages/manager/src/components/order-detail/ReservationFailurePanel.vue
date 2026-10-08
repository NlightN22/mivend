<script setup lang="ts">
import { computed } from 'vue';
import { MvStatusBadge } from '@mivend/ui-kit';
import { RESERVATION_FAILURE_LABEL } from '../../api/orders';

const props = defineProps<{ reason: string; detail?: string | null; failedAt?: string | null }>();

// The server joins per-line problems with '; ', one line per short SKU / missing item.
const lines = computed(() =>
    (props.detail ?? '')
        .split('; ')
        .map(l => l.trim())
        .filter(Boolean),
);
const failedAtLabel = computed(() =>
    props.failedAt ? new Date(props.failedAt).toLocaleString('en-US') : null,
);
</script>

<template>
    <div class="reservation-failure">
        <MvStatusBadge variant="warning">Needs attention</MvStatusBadge>
        <strong>{{ RESERVATION_FAILURE_LABEL[reason] ?? reason }}</strong>
        <ul v-if="lines.length" class="reservation-failure__lines">
            <li v-for="line in lines" :key="line">{{ line }}</li>
        </ul>
        <span v-if="failedAtLabel" class="reservation-failure__meta">{{ failedAtLabel }}</span>
        <span class="reservation-failure__meta"
            >The automatic reserve did not go through. Fix the cause and confirm the order.</span
        >
    </div>
</template>

<style scoped>
.reservation-failure {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    font-size: 13px;
}
.reservation-failure__lines {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.reservation-failure__meta {
    color: var(--el-text-color-secondary, #6b7280);
    font-size: 12px;
}
</style>
