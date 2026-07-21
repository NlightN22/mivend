<script setup lang="ts">
import { computed } from 'vue';
import MvStatusBadge from '../MvStatusBadge/MvStatusBadge.vue';
import { resolveDocumentTypeStyle } from './documentTypeStyles';

// Wraps MvStatusBadge directly (not a parallel colored-pill implementation) so a document type's
// color is always, structurally, one of MvStatusBadge's own variants — see documentTypeStyles.ts
// for why. The icon is the only thing this adds on top of a plain MvStatusBadge.
const props = defineProps<{ type: string }>();

const style = computed(() => resolveDocumentTypeStyle(props.type));
</script>

<template>
  <MvStatusBadge :variant="style.variant" class="mv-document-type-chip">
    <component :is="style.icon" class="mv-document-type-chip__icon" :size="14" :stroke-width="2" />
    {{ type }}
  </MvStatusBadge>
</template>

<style scoped>
.mv-document-type-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.mv-document-type-chip__icon {
  flex-shrink: 0;
}
</style>
