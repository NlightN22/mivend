<script setup lang="ts">
import { MvNotImplemented } from '@mivend/ui-kit';
import { useI18n } from 'vue-i18n';
import AccountSidebar from '../account/AccountSidebar.vue';

const { t } = useI18n();
</script>

<template>
    <div class="acts-page">
        <AccountSidebar />

        <section class="acts-page__content">
            <h1 class="acts-page__title">{{ t('settlements.acts.title') }}</h1>
            <MvNotImplemented
                :title="t('common.notImplemented.title')"
                :message="t('common.notImplemented.message')"
            />
        </section>
    </div>
</template>

<style scoped>
.acts-page {
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr);
    gap: 24px;
    align-items: start;
    max-width: 1440px;
    margin: 0 auto;
    padding: 24px 28px 56px;
}

.acts-page__title {
    margin: 0 0 20px;
    font-size: clamp(32px, 3vw, 44px);
    line-height: 1;
    letter-spacing: -0.055em;
}

@media (max-width: 960px) {
    .acts-page {
        grid-template-columns: 1fr;
    }
}
</style>
