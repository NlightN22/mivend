<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvButton } from '@mivend/ui-kit';
import { downloadCsvFile } from '../../api/csv';

const props = defineProps<{ disabled?: boolean; filename: string; build: () => string }>();
const { t } = useI18n();

const download = (): void => downloadCsvFile(props.filename, props.build());
</script>

<template>
    <MvButton
        variant="secondary"
        :disabled="disabled"
        data-testid="analytics-export"
        @click="download"
    >
        {{ t('analytics.export') }}
    </MvButton>
</template>
