<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvNotice } from '@mivend/ui-kit';

const { t } = useI18n();
defineProps<{ amount: string }>();
</script>

<template>
    <MvNotice variant="warning" data-testid="order-overpayment">
        <strong>{{ t('orderDetail.overpaid.title', { amount }) }}</strong>
        {{ t('orderDetail.overpaid.text') }}
    </MvNotice>
</template>
