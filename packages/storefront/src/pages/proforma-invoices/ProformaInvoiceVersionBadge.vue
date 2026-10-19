<script setup lang="ts">
import { MvStatusBadge } from '@mivend/ui-kit';
import { useI18n } from 'vue-i18n';

defineProps<{ version: number }>();
const { t } = useI18n();
</script>

<template>
    <MvStatusBadge v-if="version > 1" variant="info" class="version-badge">{{
        t('proformaInvoices.versionBadge', { version })
    }}</MvStatusBadge>
</template>
