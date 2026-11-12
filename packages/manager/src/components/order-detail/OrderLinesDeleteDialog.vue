<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvButton, MvModal } from '@mivend/ui-kit';

const { t } = useI18n();
defineProps<{ count: number; busy: boolean }>();
defineEmits<{ close: []; confirm: [] }>();
</script>

<template>
    <MvModal :title="t('orderLines.delete.title')" @close="$emit('close')">
        <p>
            {{ t('orderLines.delete.text', { n: count }, count) }}
        </p>
        <div class="delete-dialog__actions">
            <MvButton variant="secondary" @click="$emit('close')">{{
                t('orderLines.delete.keep')
            }}</MvButton>
            <MvButton variant="danger" :loading="busy" @click="$emit('confirm')">
                {{ t('orderLines.delete.confirm', { n: count }, count) }}
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
