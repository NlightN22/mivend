<script setup lang="ts">
import { MvPanel } from '@mivend/ui-kit';
import { useI18n } from 'vue-i18n';
import { formatDate } from '../../i18n/format';
import { TERMS_EDITION_DATE, TERMS_SECTIONS } from './termsSections';

const { t, tm, rt } = useI18n();

function items(section: string): string[] {
    return (tm(`terms.sections.${section}.items`) as string[]).map(item => rt(item));
}
</script>

<template>
    <main class="terms-page">
        <h1 class="terms-page__title">{{ t('terms.title') }}</h1>
        <p class="terms-page__edition">
            {{ t('terms.edition', { date: formatDate(TERMS_EDITION_DATE) }) }}
        </p>
        <p class="terms-page__intro">{{ t('terms.intro') }}</p>

        <MvPanel
            v-for="(section, index) in TERMS_SECTIONS"
            :key="section"
            :title="`${index + 1}. ${t(`terms.sections.${section}.title`)}`"
            class="terms-page__section"
        >
            <ol class="terms-page__items">
                <li v-for="(item, itemIndex) in items(section)" :key="itemIndex">
                    {{ item }}
                </li>
            </ol>
        </MvPanel>
    </main>
</template>

<style scoped>
.terms-page {
    max-width: 860px;
    margin: 0 auto;
    padding: 32px 16px 48px;
}

.terms-page__title {
    margin: 0 0 6px;
    font-size: 32px;
    font-weight: 900;
    letter-spacing: -0.05em;
}

.terms-page__edition {
    margin: 0 0 16px;
    color: var(--el-text-color-secondary, #66736e);
    font-size: 14px;
}

.terms-page__intro {
    margin: 0 0 20px;
    line-height: 1.5;
}

.terms-page__section {
    margin-bottom: 14px;
}

.terms-page__items {
    margin: 0;
    padding-left: 20px;
    display: grid;
    gap: 8px;
    line-height: 1.5;
}
</style>
