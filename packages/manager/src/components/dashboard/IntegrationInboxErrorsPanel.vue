<script setup lang="ts">
import { MvStatusBadge } from '@mivend/ui-kit';
import type { FailedIntegrationInboxEvent } from '../../api/integration-health';

defineProps<{ events: FailedIntegrationInboxEvent[] }>();
</script>

<template>
    <ul class="integration-inbox-errors">
        <li v-if="!events.length" class="integration-inbox-errors__empty">No failed inbox events</li>
        <li v-for="event in events.slice(0, 5)" :key="event.id" class="integration-inbox-errors__item">
            <div class="integration-inbox-errors__main">
                <span class="integration-inbox-errors__stream">{{ event.stream }} · {{ event.entityId }}</span>
                <span class="integration-inbox-errors__error">{{ event.lastError ?? 'No error message recorded' }}</span>
            </div>
            <MvStatusBadge variant="danger">{{ event.attempts }} attempts</MvStatusBadge>
        </li>
    </ul>
</template>

<style scoped>
.integration-inbox-errors {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.integration-inbox-errors__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    font-size: 13px;
}

.integration-inbox-errors__main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.integration-inbox-errors__stream {
    color: #111827;
    font-weight: 600;
}

.integration-inbox-errors__error {
    color: #6b7280;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.integration-inbox-errors__empty {
    color: #6b7280;
    font-size: 13px;
    padding: 10px 12px;
}
</style>
