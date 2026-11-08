<script setup lang="ts">
import { MvButton } from '@mivend/ui-kit';

defineProps<{ count: number; busy: boolean }>();
defineEmits<{ remove: []; clear: [] }>();
</script>

<template>
    <div class="bulk-bar" role="toolbar" aria-label="Selected positions">
        <span>{{ count }} selected</span>
        <MvButton variant="danger" size="sm" :disabled="busy" @click="$emit('remove')">
            Delete {{ count }} {{ count === 1 ? 'position' : 'positions' }}
        </MvButton>
        <MvButton variant="secondary" size="sm" @click="$emit('clear')">Cancel</MvButton>
    </div>
</template>

<style scoped>
.bulk-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    margin-bottom: 10px;
    border-radius: var(--app-radius-sm, 8px);
    background: var(--app-stock-in-bg);
    font-size: 13px;
    font-weight: 700;
}
</style>
