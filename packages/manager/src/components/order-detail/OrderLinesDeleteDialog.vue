<script setup lang="ts">
import { MvButton, MvModal } from '@mivend/ui-kit';

defineProps<{ count: number; busy: boolean }>();
defineEmits<{ close: []; confirm: [] }>();
</script>

<template>
    <MvModal title="Delete positions?" @close="$emit('close')">
        <p>
            {{ count }} {{ count === 1 ? 'position' : 'positions' }} will be removed from the order.
        </p>
        <div class="delete-dialog__actions">
            <MvButton variant="secondary" @click="$emit('close')">Keep</MvButton>
            <MvButton variant="danger" :loading="busy" @click="$emit('confirm')">
                Delete {{ count }} {{ count === 1 ? 'position' : 'positions' }}
            </MvButton>
        </div>
    </MvModal>
</template>

<style scoped>
.delete-dialog__actions {
    display: flex;
    gap: 12px;
    margin-top: 12px;
}
</style>
