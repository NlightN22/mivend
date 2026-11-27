<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvPagination, useUrlState } from '@mivend/ui-kit';
import AccountSidebar from '../account/AccountSidebar.vue';
import DocumentRow from '../documents/DocumentRow.vue';
import { useDocuments, toDocData } from '../documents/useDocuments';
import { usePaginationLabels } from '../../composables/usePaginationLabels';

const { t } = useI18n();
const paginationLabels = usePaginationLabels();

const { documents, totalItems, loading, load } = useDocuments();

const PAGE_SIZE = 20;

const { page } = useUrlState({});

function reload(): void {
    void load({ take: PAGE_SIZE, skip: (page.value - 1) * PAGE_SIZE, type: 'return' });
}

watch(page, reload);

onMounted(reload);
</script>

<template>
    <div class="returns-page">
        <AccountSidebar />

        <section class="returns-page__content">
            <div class="returns-page__head">
                <div>
                    <h1 class="returns-page__title">{{ t('returns.title') }}</h1>
                    <p class="returns-page__subtitle">{{ t('returns.subtitle') }}</p>
                </div>
            </div>

            <div class="returns-page__main">
                <div v-if="loading" class="returns-page__state">{{ t('common.loading') }}</div>
                <div v-else-if="!documents.length" class="returns-page__state">
                    {{ t('returns.empty') }}
                </div>
                <template v-else>
                    <MvPagination
                        v-bind="paginationLabels"
                        :page="page"
                        :page-size="PAGE_SIZE"
                        :total="totalItems"
                        @update:page="page = $event"
                    />
                    <div class="returns-page__list">
                        <DocumentRow v-for="doc in documents" :key="doc.id" :doc="toDocData(doc)" />
                    </div>
                    <MvPagination
                        v-bind="paginationLabels"
                        :page="page"
                        :page-size="PAGE_SIZE"
                        :total="totalItems"
                        @update:page="page = $event"
                    />
                </template>
            </div>
        </section>
    </div>
</template>

<style scoped>
.returns-page {
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr);
    gap: 24px;
    align-items: start;
    max-width: 1440px;
    margin: 0 auto;
    padding: 24px 28px 56px;
}

.returns-page__content {
    min-width: 0;
}

.returns-page__head {
    margin-bottom: 18px;
}

.returns-page__title {
    margin: 0 0 6px;
    font-size: clamp(34px, 3.6vw, 50px);
    line-height: 0.98;
    letter-spacing: -0.055em;
}

.returns-page__subtitle {
    margin: 0;
    color: var(--app-nav-label);
    font-size: 14px;
    line-height: 1.45;
}

.returns-page__main {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
    min-width: 0;
}

.returns-page__state {
    text-align: center;
    padding: 48px 24px;
    color: var(--app-nav-label);
    font-size: 15px;
}

.returns-page__list {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
}

@media (max-width: 960px) {
    .returns-page {
        grid-template-columns: minmax(0, 1fr);
        padding-left: 16px;
        padding-right: 16px;
    }
}
</style>
