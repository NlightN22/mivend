<script setup lang="ts">
import {
    MvDateTimeCell,
    MvErrorState,
    MvPagination,
    MvSkeleton,
    MvStatusBadge,
} from '@mivend/ui-kit';
import type { ChangeJournalEntry } from '../../api/changeJournal';
import type { ManagerOption } from '../../api/orders';
import type { ChangeJournalError } from '../../composables/useChangeJournal';
import {
    changeLines,
    formatAction,
    formatActor,
    formatEntityType,
    formatSource,
} from '../../utils/changeJournalFormat';
import { CHANGE_JOURNAL_LABELS as L } from './changeJournalLabels';

const props = withDefaults(
    defineProps<{
        entries: ChangeJournalEntry[];
        totalItems: number;
        page: number;
        pageSize: number;
        loading: boolean;
        error: ChangeJournalError | null;
        managers?: ManagerOption[];
        showEntity?: boolean;
        emptyText?: string;
    }>(),
    { managers: () => [], showEntity: false, emptyText: L.empty },
);

defineEmits<{ 'update:page': [page: number]; retry: [] }>();

const ACTION_VARIANT: Record<string, 'success' | 'info' | 'danger' | 'neutral'> = {
    insert: 'success',
    update: 'info',
    'soft-remove': 'danger',
    remove: 'danger',
    recover: 'success',
};

function adminName(id: string): string | null {
    return props.managers.find(m => m.id === id)?.name ?? null;
}
</script>

<template>
    <div class="change-journal" data-testid="change-journal">
        <MvErrorState
            v-if="error"
            :title="L.errorTitle"
            :message="error === 'forbidden' ? L.errorForbidden : undefined"
            :retry-label="L.retry"
            @retry="$emit('retry')"
        />
        <div v-else-if="loading && !entries.length" class="change-journal__skeleton">
            <span class="change-journal__sr">{{ L.loading }}</span>
            <MvSkeleton v-for="i in 3" :key="i" height="72px" radius="12px" />
        </div>
        <p v-else-if="!entries.length" class="change-journal__empty">{{ emptyText }}</p>
        <template v-else>
            <ul class="change-journal__list" :aria-busy="loading">
                <li v-for="entry in entries" :key="entry.id" class="change-journal__entry">
                    <div class="change-journal__head">
                        <MvDateTimeCell :value="entry.occurredAt" />
                        <MvStatusBadge :variant="ACTION_VARIANT[entry.action] ?? 'neutral'">
                            {{ formatAction(entry.action) }}
                        </MvStatusBadge>
                        <span v-if="showEntity" class="change-journal__entity">
                            {{ formatEntityType(entry.entityType) }} #{{ entry.entityId }}
                        </span>
                        <span class="change-journal__actor">{{
                            formatActor(entry, adminName)
                        }}</span>
                        <span class="change-journal__source">{{ formatSource(entry.source) }}</span>
                    </div>
                    <div v-if="changeLines(entry.changes).length" class="change-journal__scroll">
                        <table class="change-journal__changes">
                            <thead>
                                <tr>
                                    <th>{{ L.field }}</th>
                                    <th>{{ L.before }}</th>
                                    <th>{{ L.after }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="line in changeLines(entry.changes)" :key="line.field">
                                    <td>{{ line.field }}</td>
                                    <td
                                        v-if="line.redacted"
                                        colspan="2"
                                        class="change-journal__redacted"
                                    >
                                        {{ L.redacted }}
                                    </td>
                                    <template v-else>
                                        <td>{{ line.before }}</td>
                                        <td>{{ line.after }}</td>
                                    </template>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <p v-else class="change-journal__muted">{{ L.noFields }}</p>
                </li>
            </ul>
            <MvPagination
                v-if="totalItems > pageSize"
                :page="page"
                :page-size="pageSize"
                :total="totalItems"
                :previous-label="L.previous"
                :next-label="L.next"
                :summary-label="L.summary"
                :page-label="L.pageOf"
                @update:page="$emit('update:page', $event)"
            />
        </template>
    </div>
</template>

<style scoped>
.change-journal {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
}

.change-journal__skeleton,
.change-journal__list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
}

.change-journal__sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
}

.change-journal__entry {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    border: 1px solid var(--app-nav-border);
    border-radius: var(--app-radius-md);
    background: var(--app-surface);
    min-width: 0;
}

.change-journal__head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
    font-size: 13px;
}

.change-journal__actor,
.change-journal__entity {
    font-weight: 700;
    color: var(--app-nav-text-strong);
    min-width: 0;
    overflow-wrap: anywhere;
}

.change-journal__source,
.change-journal__muted,
.change-journal__empty {
    color: var(--app-nav-label);
    font-size: 13px;
    overflow-wrap: anywhere;
}

.change-journal__muted,
.change-journal__empty {
    margin: 0;
}

.change-journal__scroll {
    overflow-x: auto;
}

.change-journal__changes {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}

.change-journal__changes th {
    text-align: left;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--app-nav-label);
    padding: 4px 8px;
    border-bottom: 1px solid var(--app-nav-border);
}

.change-journal__changes td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--app-nav-border);
    vertical-align: top;
    overflow-wrap: anywhere;
}

.change-journal__redacted {
    font-style: italic;
    color: var(--app-nav-label);
}
</style>
