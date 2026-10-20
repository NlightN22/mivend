<script setup lang="ts">
import { MvNotImplemented } from '@mivend/ui-kit';
import { useI18n } from 'vue-i18n';
import { formatMoney } from '../../i18n/format';
import { useDemoMode } from '../../composables/useDemoMode';
import { DEMO_DUE } from './balanceDemo';

const { t } = useI18n();
const { demoAllowed } = useDemoMode();
</script>

<template>
    <div class="bal-panel">
        <div class="bal-panel__title">{{ t('balance.pay.title') }}</div>
        <MvNotImplemented
            v-if="!demoAllowed"
            size="widget"
            :title="t('common.notImplemented.title')"
            :message="t('common.notImplemented.message')"
        />
        <template v-else>
            <div class="bal-panel__sub">{{ t('balance.pay.sub') }}</div>
            <div class="bal-pay">
                <div class="bal-pay__label">{{ t('balance.pay.amountDue') }}</div>
                <input class="bal-pay__input" :value="formatMoney(DEMO_DUE)" />
                <button class="bal-wide-btn">{{ t('balance.pay.proceed') }}</button>
            </div>
            <div class="bal-mini-list">
                <div>
                    <div class="bal-mini-title">{{ t('balance.pay.advanceTitle') }}</div>
                    <div class="bal-mini-note">{{ t('balance.pay.advanceNote') }}</div>
                </div>
                <div>
                    <div class="bal-mini-title">{{ t('balance.pay.documentsTitle') }}</div>
                    <div class="bal-mini-note">{{ t('balance.pay.documentsNote') }}</div>
                </div>
            </div>
        </template>
    </div>
</template>

<style scoped src="./BalancePanels.css"></style>
