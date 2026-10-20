<script setup lang="ts">
import { MvStatusBadge } from '@mivend/ui-kit';
import { useI18n } from 'vue-i18n';
import { isContractKind } from './proformaKind';

defineProps<{ kind: string }>();
const { t } = useI18n();
</script>

<template>
    <MvStatusBadge v-if="isContractKind(kind)" variant="info" class="kind-badge">{{
        t(`proformaInvoices.kind.${kind}`)
    }}</MvStatusBadge>
</template>

<style scoped>
.kind-badge {
    margin-left: 6px;
    vertical-align: middle;
}
</style>
