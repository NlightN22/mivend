<script setup lang="ts">
import { IconX } from '@tabler/icons-vue';
import { useI18n } from 'vue-i18n';

defineProps<{ label: string }>();
const emit = defineEmits<{ remove: [] }>();
const { t } = useI18n();
</script>

<template>
    <span class="scope-chip">
        <span class="scope-chip__label">{{ label }}</span>
        <button
            class="scope-chip__remove"
            type="button"
            :aria-label="t('search.removeScope')"
            @click="emit('remove')"
        >
            <IconX :size="14" aria-hidden="true" />
        </button>
    </span>
</template>

<style scoped>
.scope-chip {
    display: inline-flex;
    align-items: center;
    max-width: 100%;
    gap: 4px;
    margin-top: 6px;
    padding: 2px 4px 2px 10px;
    border-radius: 999px;
    background: var(--app-chip-bg);
    color: var(--app-chip-fg);
    font-size: 12px;
    font-weight: 600;
}
.scope-chip__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.scope-chip__remove {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    padding: 0;
}
</style>
