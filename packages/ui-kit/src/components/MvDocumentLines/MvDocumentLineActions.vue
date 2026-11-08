<script setup lang="ts">
import { IconCheck, IconPencil, IconTrash, IconX } from '@tabler/icons-vue';

defineProps<{
    editing: boolean;
    saving: boolean;
    busy: boolean;
    canEdit: boolean;
    canRemove: boolean;
}>();
defineEmits<{ start: []; commit: []; cancel: []; remove: [] }>();
</script>

<template>
    <template v-if="editing">
        <button
            type="button"
            class="doc-actions__btn doc-actions__btn--ok"
            aria-label="Apply changes"
            title="Apply changes"
            :disabled="saving || busy"
            @click="$emit('commit')"
        >
            <IconCheck :size="16" />
        </button>
        <button
            type="button"
            class="doc-actions__btn doc-actions__btn--cancel"
            aria-label="Discard changes"
            title="Discard changes"
            :disabled="saving"
            @click="$emit('cancel')"
        >
            <IconX :size="16" />
        </button>
    </template>
    <button
        v-else-if="canEdit"
        type="button"
        class="doc-actions__btn"
        aria-label="Edit line"
        title="Edit line"
        :disabled="busy"
        @click="$emit('start')"
    >
        <IconPencil :size="16" />
    </button>
    <button
        v-if="!editing && canRemove"
        type="button"
        class="doc-actions__btn"
        aria-label="Delete position"
        title="Delete position"
        :disabled="busy"
        @click="$emit('remove')"
    >
        <IconTrash :size="16" />
    </button>
</template>

<style scoped>
.doc-actions__btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    margin-left: 4px;
    border: 1px solid var(--el-border-color);
    border-radius: var(--app-radius-sm, 8px);
    background: var(--app-surface);
    color: var(--app-text-body3);
    cursor: pointer;
}

.doc-actions__btn:hover:not(:disabled) {
    background: var(--app-row-hover);
}

.doc-actions__btn:disabled {
    cursor: default;
    opacity: 0.5;
}

.doc-actions__btn--ok {
    border-color: var(--app-primary-btn);
    background: var(--app-primary-btn);
    color: var(--app-on-accent);
}

.doc-actions__btn--ok:hover:not(:disabled) {
    background: var(--app-primary-btn-active);
}

.doc-actions__btn--cancel {
    border-color: var(--app-danger-bg);
    background: var(--app-danger-bg);
    color: var(--app-danger-fg);
}
</style>
