<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { MvPagination, useUrlState } from '@mivend/ui-kit';
import MvButton from '@mivend/ui-kit/src/components/MvButton/MvButton.vue';
import AccountSidebar from '../account/AccountSidebar.vue';
import { formatDate } from '../../i18n/format';
import { usePaginationLabels } from '../../composables/usePaginationLabels';
import { useContractFiles } from './useContractFiles';

const { t, te } = useI18n();
const paginationLabels = usePaginationLabels();
const { files, totalItems, loading, load } = useContractFiles();

const PAGE_SIZE = 20;
const { page } = useUrlState({}, {});

const kindLabel = (kind: string): string =>
    te(`contracts.kind.${kind}`) ? t(`contracts.kind.${kind}`) : kind;

function reload(): void {
    void load((page.value - 1) * PAGE_SIZE, PAGE_SIZE);
}

watch(page, reload);
onMounted(reload);
</script>

<template>
    <div class="contracts-page">
        <AccountSidebar />

        <section class="contracts-page__content">
            <h1 class="contracts-page__title">{{ t('contracts.title') }}</h1>
            <p class="contracts-page__subtitle">{{ t('contracts.subtitle') }}</p>

            <div v-if="loading" class="contracts-page__state">{{ t('common.loading') }}</div>
            <div v-else-if="!files.length" class="contracts-page__state">
                {{ t('contracts.empty') }}
            </div>
            <template v-else>
                <div class="contracts-page__table-wrap">
                    <table class="contracts-page__table">
                        <thead>
                            <tr>
                                <th>{{ t('contracts.columns.contract') }}</th>
                                <th>{{ t('contracts.columns.kind') }}</th>
                                <th>{{ t('contracts.columns.date') }}</th>
                                <th>{{ t('contracts.columns.file') }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="f in files" :key="f.uuid">
                                <td>{{ f.contractName ?? f.contractId }}</td>
                                <td>{{ kindLabel(f.kind) }}</td>
                                <td>
                                    {{
                                        formatDate(f.createdAt, {
                                            day: '2-digit',
                                            month: '2-digit',
                                            year: 'numeric',
                                        })
                                    }}
                                </td>
                                <td>
                                    <a :href="f.downloadUrl" :download="f.fileName">
                                        <MvButton variant="secondary" size="sm">{{
                                            t('contracts.download')
                                        }}</MvButton>
                                    </a>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <MvPagination
                    v-bind="paginationLabels"
                    :page="page"
                    :page-size="PAGE_SIZE"
                    :total="totalItems"
                    @update:page="page = $event"
                />
            </template>
        </section>
    </div>
</template>

<style scoped>
.contracts-page {
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr);
    gap: 24px;
    align-items: start;
    max-width: 1440px;
    margin: 0 auto;
    padding: 24px 28px 56px;
}

.contracts-page__content {
    min-width: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
}

.contracts-page__title {
    margin: 0;
    font-size: clamp(34px, 3.6vw, 50px);
    line-height: 0.98;
    letter-spacing: -0.055em;
}

.contracts-page__subtitle {
    margin: 0;
    color: var(--app-nav-label);
    font-size: 14px;
    line-height: 1.45;
}

.contracts-page__state {
    text-align: center;
    padding: 48px 24px;
    color: var(--app-nav-label);
    font-size: 15px;
}

.contracts-page__table-wrap {
    overflow-x: auto;
    background: var(--app-surface);
    border: 1px solid var(--app-border-glass);
    border-radius: 20px;
    box-shadow: 0 14px 36px var(--app-ink-08);
}

.contracts-page__table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
}

.contracts-page__table th,
.contracts-page__table td {
    padding: 14px 18px;
    text-align: left;
    border-bottom: 1px solid var(--app-border-glass);
    overflow-wrap: anywhere;
}

.contracts-page__table th {
    color: var(--app-nav-label);
    font-size: 13px;
    font-weight: 850;
}

.contracts-page__table tbody tr:last-child td {
    border-bottom: 0;
}

@media (max-width: 960px) {
    .contracts-page {
        grid-template-columns: minmax(0, 1fr);
        padding-left: 16px;
        padding-right: 16px;
    }
}
</style>
