<script setup lang="ts">
import { MvNotice } from '@mivend/ui-kit';
import type { SplitOutcome } from '../../api/orderLineEdit';

defineProps<{
    error: string;
    split: SplitOutcome[];
    alreadyWithinStock: boolean;
}>();
</script>

<template>
    <div class="edit-bar">
        <MvNotice v-if="error" variant="error">{{ error }}</MvNotice>
        <MvNotice v-else-if="alreadyWithinStock" variant="info">
            Already within available stock; nothing to cut.
        </MvNotice>
        <MvNotice v-else-if="split.length" variant="info">
            Cut {{ split.length }} line(s); the part stock could not cover is recorded as shortfall.
        </MvNotice>
    </div>
</template>

<style scoped>
.edit-bar {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 10px;
}
</style>
