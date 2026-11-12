<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvNotice } from '@mivend/ui-kit';
import type { SplitOutcome } from '../../api/orderLineEdit';

const { t } = useI18n();
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
            {{ t('orderLines.editBar.withinStock') }}
        </MvNotice>
        <MvNotice v-else-if="split.length" variant="info">
            {{ t('orderLines.editBar.cut', { n: split.length }) }}
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
