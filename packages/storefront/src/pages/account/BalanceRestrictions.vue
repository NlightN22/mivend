<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import { LIMIT_REMAINING_WARNING_SHARE } from '../../utils/creditLimit';
import type { RestrictionKey } from './balanceView';

defineProps<{ items: RestrictionKey[]; overdue: string }>();

const { t } = useI18n();
const percent = Math.round(LIMIT_REMAINING_WARNING_SHARE * 100);
</script>

<template>
    <div class="bal-panel">
        <div class="bal-panel__title">{{ t('balance.restrictions.title') }}</div>
        <div class="bal-panel__sub">{{ t('balance.restrictions.sub') }}</div>
        <div class="bal-mini-list">
            <div v-for="key in items" :key="key">
                <div class="bal-mini-title">{{ t(`balance.restrictions.${key}Title`) }}</div>
                <div class="bal-mini-note">
                    {{ t(`balance.restrictions.${key}Note`, { amount: overdue, percent }) }}
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped src="./BalancePanels.css"></style>
