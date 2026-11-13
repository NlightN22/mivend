<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import DiscountsWorkspace from '../../components/discounts/DiscountsWorkspace.vue';

const { t } = useI18n();
</script>

<template>
    <div class="discounts-page">
        <div class="discounts-page__header">
            <div class="discounts-page__breadcrumb">{{ t('discounts.page.breadcrumb') }}</div>
            <h1 class="discounts-page__title">{{ t('discounts.page.title') }}</h1>
        </div>

        <DiscountsWorkspace />
    </div>
</template>

<style scoped>
.discounts-page {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.discounts-page__breadcrumb {
    color: var(--app-text-grey);
    font-size: 13px;
    margin-bottom: 6px;
}

.discounts-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}

@media (max-width: 800px) {
    .discounts-page__breadcrumb {
        display: none;
    }

    .discounts-page__title {
        font-size: 22px;
    }
}
</style>
