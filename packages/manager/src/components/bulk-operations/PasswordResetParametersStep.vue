<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvNotice } from '@mivend/ui-kit';

defineProps<{ modelValue: Record<string, unknown> }>();

const { t } = useI18n();
</script>

<template>
    <MvNotice variant="info">{{ t('bulkOperations.passwordReset.notice') }}</MvNotice>
</template>
