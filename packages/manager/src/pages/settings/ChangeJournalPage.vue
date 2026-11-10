<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { MvPanel, useDebouncedCallback } from '@mivend/ui-kit';
import { fetchChangeJournal } from '../../api/changeJournal';
import { fetchManagerOptions, type ManagerOption } from '../../api/orders';
import { useChangeJournal } from '../../composables/useChangeJournal';
import { useUrlSyncedState } from '../../composables/useUrlSyncedState';
import ChangeJournalFilters from '../../components/change-journal/ChangeJournalFilters.vue';
import ChangeJournalList from '../../components/change-journal/ChangeJournalList.vue';
import { CHANGE_JOURNAL_LABELS as L } from '../../components/change-journal/changeJournalLabels';
import {
    BLANK_CHANGE_JOURNAL_FILTERS,
    toChangeJournalFilter,
    type ChangeJournalUrlFilters,
} from '../../utils/changeJournalFilter';

const TEXT_KEYS = ['entityType', 'userId'] as const;

const route = useRoute();
const filters = ref<ChangeJournalUrlFilters>({ ...BLANK_CHANGE_JOURNAL_FILTERS });
const managers = ref<ManagerOption[]>([]);

const journal = useChangeJournal(request =>
    fetchChangeJournal(toChangeJournalFilter(filters.value), request),
);
const { entries, totalItems, page, pageSize, loading, error, load } = journal;
const { fromQuery, toQuery, pushQuery } = useUrlSyncedState(BLANK_CHANGE_JOURNAL_FILTERS);

function readUrl(): void {
    const parsed = { ...BLANK_CHANGE_JOURNAL_FILTERS };
    page.value = 1;
    fromQuery(parsed, page);
    filters.value = parsed;
}

const reloadAfterTyping = useDebouncedCallback(() => void load(1));

function onFilters(next: ChangeJournalUrlFilters): void {
    const typed = TEXT_KEYS.some(key => next[key] !== filters.value[key]);
    filters.value = next;
    page.value = 1;
    if (typed) {
        toQuery(next, page);
        reloadAfterTyping();
    } else {
        pushQuery(next, page);
        void load(1);
    }
}

function onPage(target: number): void {
    page.value = target;
    pushQuery(filters.value, page);
    void load(target);
}

function onReset(): void {
    onFilters({ ...BLANK_CHANGE_JOURNAL_FILTERS });
}

watch(
    () => route.query,
    () => {
        const before = JSON.stringify([filters.value, page.value]);
        readUrl();
        if (JSON.stringify([filters.value, page.value]) !== before) void load();
    },
);

onMounted(async () => {
    readUrl();
    void load();
    // Names are a convenience: without them the list falls back to administrator ids.
    managers.value = await fetchManagerOptions().catch(() => []);
});
</script>

<template>
    <div class="change-journal-page">
        <div class="change-journal-page__breadcrumb">Workspace / Settings</div>
        <h1 class="change-journal-page__title">{{ L.pageTitle }}</h1>
        <p class="change-journal-page__subtitle">{{ L.pageSubtitle }}</p>

        <MvPanel>
            <ChangeJournalFilters
                :model-value="filters"
                :managers="managers"
                @update:model-value="onFilters"
                @reset="onReset"
            />
        </MvPanel>

        <ChangeJournalList
            :entries="entries"
            :total-items="totalItems"
            :page="page"
            :page-size="pageSize"
            :loading="loading"
            :error="error"
            :managers="managers"
            :empty-text="L.emptyJournal"
            show-entity
            @update:page="onPage"
            @retry="load()"
        />
    </div>
</template>

<style scoped>
.change-journal-page {
    display: flex;
    flex-direction: column;
    gap: 18px;
    min-width: 0;
}

.change-journal-page__breadcrumb,
.change-journal-page__subtitle {
    margin: 0;
    color: var(--app-nav-label);
    font-size: 13px;
}

.change-journal-page__title {
    margin: 0;
    font-size: 28px;
    letter-spacing: -0.03em;
}
</style>
