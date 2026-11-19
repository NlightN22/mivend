<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { LegalStatus } from '../api/legal';

defineProps<{ pending: LegalStatus[]; checked: Record<string, boolean> }>();
const emit = defineEmits<{ (e: 'toggle', kind: string, value: boolean): void }>();
const { t } = useI18n();

const LINK_KINDS = ['agreement', 'personal-data-consent'];
</script>

<template>
    <div class="legal-checks">
        <label v-for="status in pending" :key="status.kind" class="legal-checks__row">
            <input
                type="checkbox"
                :checked="checked[status.kind]"
                :data-testid="`legal-check-${status.kind}`"
                @change="emit('toggle', status.kind, ($event.target as HTMLInputElement).checked)"
            />
            <i18n-t
                v-if="LINK_KINDS.includes(status.kind)"
                :keypath="`legal.accept.${status.kind}`"
                tag="span"
            >
                <template #link>
                    <a :href="`/legal/${status.kind}`" target="_blank" rel="noopener" @click.stop>{{
                        t(`legal.accept.${status.kind}Link`)
                    }}</a>
                </template>
            </i18n-t>
            <span v-else>{{ t(`legal.accept.${status.kind}`) }}</span>
        </label>
    </div>
</template>

<style scoped>
.legal-checks {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
    padding-top: 14px;
    border-top: 1px solid var(--app-border-glass);
    font-size: 14px;
    line-height: 1.4;
    color: var(--app-slate-fg);
}

.legal-checks__row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    cursor: pointer;
}

.legal-checks__row input {
    margin-top: 2px;
    accent-color: var(--el-color-primary);
}

.legal-checks__row a {
    color: var(--app-nav-accent);
    text-decoration: underline;
}
</style>
