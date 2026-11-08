<script setup lang="ts">
import { IconCheck, IconPencil, IconX } from '@tabler/icons-vue';
import { MvActionMenu } from '@mivend/ui-kit';

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
            class="line-actions__btn line-actions__btn--ok"
            aria-label="Apply changes"
            title="Apply changes"
            :disabled="saving || busy"
            @click="$emit('commit')"
        >
            <IconCheck :size="16" />
        </button>
        <button
            type="button"
            class="line-actions__btn line-actions__btn--cancel"
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
        class="line-actions__btn"
        aria-label="Edit line"
        title="Edit line"
        :disabled="busy"
        @click="$emit('start')"
    >
        <IconPencil :size="16" />
    </button>
    <MvActionMenu
        v-if="!editing && canRemove"
        :items="[{ key: 'remove', label: 'Delete position', danger: true }]"
        label="Position actions"
        @select="$emit('remove')"
    />
</template>

<style scoped>
.line-actions__btn {
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

.line-actions__btn:hover:not(:disabled) {
    background: var(--app-row-hover);
}

.line-actions__btn:disabled {
    cursor: default;
    opacity: 0.5;
}

.line-actions__btn--ok {
    border-color: var(--app-primary-btn);
    background: var(--app-primary-btn);
    color: var(--app-on-accent);
}

.line-actions__btn--ok:hover:not(:disabled) {
    background: var(--app-primary-btn-active);
}

.line-actions__btn--cancel {
    border-color: var(--app-danger-bg);
    background: var(--app-danger-bg);
    color: var(--app-danger-fg);
}
</style>
