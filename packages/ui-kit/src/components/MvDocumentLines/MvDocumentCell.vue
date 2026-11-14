<script setup lang="ts">
import { useUiLabels } from '../../utils/uiLabels';
import { ref } from 'vue';
import MvButton from '../MvButton/MvButton.vue';
import MvFlagChip from '../MvFlagChip/MvFlagChip.vue';
import MvPopover from '../MvPopover/MvPopover.vue';
import MvFlagNotes from './MvFlagNotes.vue';
import type { DocFlag } from './documentLinesModel';
const uiLabel = useUiLabels();

defineProps<{ flag?: DocFlag }>();
const emit = defineEmits<{ action: [key: string] }>();
const open = ref(false);

function run(key: string): void {
    open.value = false;
    emit('action', key);
}
</script>

<template>
    <MvPopover v-if="flag" v-model:open="open" :width="300">
        <template #trigger>
            <MvFlagChip
                :tone="flag.tone"
                :label="uiLabel('showWhatIsWrong', 'Show what is wrong here')"
                :tip-disabled="open"
            >
                <slot />
                <template #tip><MvFlagNotes :notes="flag.notes" /></template>
            </MvFlagChip>
        </template>
        <MvFlagNotes :notes="flag.notes" />
        <div v-if="flag.actions?.length" class="mv-doc-cell__actions">
            <MvButton
                v-for="a in flag.actions"
                :key="a.key"
                size="sm"
                :variant="a.variant ?? 'primary'"
                @click="run(a.key)"
            >
                {{ a.label }}
            </MvButton>
        </div>
    </MvPopover>
    <slot v-else />
</template>

<style scoped>
.mv-doc-cell__actions {
    display: flex;
    gap: 8px;
}
</style>
