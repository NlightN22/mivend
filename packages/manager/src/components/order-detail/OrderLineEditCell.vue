<script setup lang="ts">
import { ref, watch } from 'vue';
import { MvButton, MvInput } from '@mivend/ui-kit';

const props = defineProps<{ quantity: number; busy: boolean }>();
const emit = defineEmits<{ save: [quantity: number]; remove: [] }>();

const draft = ref(String(props.quantity));
watch(
    () => props.quantity,
    value => (draft.value = String(value)),
);

function save(): void {
    const value = Number(draft.value);
    if (Number.isInteger(value) && value > 0 && value !== props.quantity) emit('save', value);
}
</script>

<template>
    <div class="line-edit">
        <MvInput
            size="sm"
            type="number"
            :model-value="draft"
            @update:model-value="draft = $event"
            @keyup.enter="save"
        />
        <MvButton size="sm" :loading="busy" @click="save">Save</MvButton>
        <button type="button" class="line-edit__remove" :disabled="busy" @click="emit('remove')">
            Remove
        </button>
    </div>
</template>

<style scoped>
.line-edit {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 200px;
}

.line-edit__remove {
    background: none;
    border: none;
    color: var(--el-color-danger, #dc2626);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
}
</style>
