<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvButton } from '@mivend/ui-kit';

defineProps<{ repeating: boolean; canCancel: boolean }>();
defineEmits<{ repeat: []; cancel: [] }>();
const { t } = useI18n();
</script>

<template>
    <div class="oac">
        <h2 class="oac-title">{{ t('orders.detail.actions') }}</h2>
        <MvButton variant="primary" :loading="repeating" @click="$emit('repeat')">{{
            t('orders.detail.repeat')
        }}</MvButton>
        <MvButton v-if="canCancel" variant="danger" @click="$emit('cancel')">{{
            t('orders.cancel.button')
        }}</MvButton>
    </div>
</template>

<style scoped>
.oac {
    display: grid;
    gap: 10px;
    background: #fff;
    border: 1px solid #edf2ef;
    border-radius: 20px;
    padding: 18px 20px;
}
.oac-title {
    margin: 0 0 4px;
    font-size: 16px;
    font-weight: 950;
    letter-spacing: -0.03em;
}
</style>
