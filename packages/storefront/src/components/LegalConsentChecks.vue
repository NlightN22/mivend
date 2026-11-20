<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { MvCheckbox } from '@mivend/ui-kit';
import type { LegalStatus } from '../api/legal';

defineProps<{
    pending: LegalStatus[];
    checked: Record<string, boolean>;
    invalid?: boolean;
}>();
const emit = defineEmits<{ (e: 'toggle', kind: string, value: boolean): void }>();
const { t } = useI18n();

const LINK_KINDS = ['agreement', 'personal-data-consent'];
</script>

<template>
    <div class="legal-checks">
        <MvCheckbox
            v-for="status in pending"
            :key="status.kind"
            multiline
            :model-value="!!checked[status.kind]"
            :error="invalid && status.required && !checked[status.kind]"
            :data-testid="`legal-check-${status.kind}`"
            @update:model-value="emit('toggle', status.kind, $event)"
        >
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
        </MvCheckbox>
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

.legal-checks a {
    color: var(--app-nav-accent);
    text-decoration: underline;
}
</style>
