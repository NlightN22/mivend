<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvModal } from '@mivend/ui-kit';
import type { RelatedDocument } from '../../api/orderDetail';
import RelatedDocumentsPanel from './RelatedDocumentsPanel.vue';

const { t } = useI18n();
defineProps<{ documents: RelatedDocument[] }>();
defineEmits<{ close: [] }>();
</script>

<template>
    <MvModal :title="t('orderDetail.actions.documents')" @close="$emit('close')">
        <RelatedDocumentsPanel :documents="documents" />
    </MvModal>
</template>
