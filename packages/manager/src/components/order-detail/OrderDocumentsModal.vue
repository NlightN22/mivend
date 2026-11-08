<script setup lang="ts">
import { MvModal } from '@mivend/ui-kit';
import type { RelatedDocument } from '../../api/orderDetail';
import RelatedDocumentsPanel from './RelatedDocumentsPanel.vue';

defineProps<{ documents: RelatedDocument[] }>();
defineEmits<{ close: [] }>();
</script>

<template>
    <MvModal title="Documents" @close="$emit('close')">
        <RelatedDocumentsPanel :documents="documents" />
    </MvModal>
</template>
