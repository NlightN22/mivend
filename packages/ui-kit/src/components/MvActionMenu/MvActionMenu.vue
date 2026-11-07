<script setup lang="ts">
import { ElDropdown, ElDropdownMenu, ElDropdownItem } from 'element-plus';
import { IconDots } from '@tabler/icons-vue';

export interface ActionMenuItem {
    key: string;
    label: string;
    disabled?: boolean;
    danger?: boolean;
}

withDefaults(defineProps<{ items: ActionMenuItem[]; label?: string }>(), {
    label: 'More actions',
});
const emit = defineEmits<{ select: [key: string] }>();
</script>

<template>
    <ElDropdown
        trigger="click"
        placement="bottom-end"
        popper-class="mv-action-menu__popper"
        @command="(key: string) => emit('select', key)"
    >
        <button type="button" class="mv-action-menu__trigger" :aria-label="label" :title="label">
            <slot><IconDots :size="18" /></slot>
        </button>
        <template #dropdown>
            <ElDropdownMenu>
                <ElDropdownItem
                    v-for="item in items"
                    :key="item.key"
                    :command="item.key"
                    :disabled="item.disabled"
                    :class="{ 'mv-action-menu__item--danger': item.danger }"
                >
                    {{ item.label }}
                </ElDropdownItem>
            </ElDropdownMenu>
        </template>
    </ElDropdown>
</template>

<style scoped>
.mv-action-menu__trigger {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 36px;
    height: 36px;
    padding: 0 8px;
    border: 1px solid var(--el-border-color);
    border-radius: var(--app-radius-md, 12px);
    background: var(--app-surface);
    color: var(--app-text-body3);
    cursor: pointer;
}

.mv-action-menu__trigger:hover {
    background: var(--app-row-hover);
}
</style>

<style>
.mv-action-menu__popper .mv-action-menu__item--danger {
    color: var(--app-danger-fg);
}
</style>
