<script setup lang="ts">
import { computed } from 'vue';
import { MvDateTimeCell, MvModal } from '@mivend/ui-kit';
import type { ChangeJournalEntry } from '../../api/changeJournal';
import { changeLines, formatAction } from '../../utils/changeJournalFormat';
import { CHANGE_JOURNAL_LABELS as L } from './changeJournalLabels';

const props = defineProps<{ entry: ChangeJournalEntry; actor: string; source: string }>();
defineEmits<{ close: [] }>();

const lines = computed(() => changeLines(props.entry.changes));
</script>

<template>
    <MvModal :title="formatAction(entry.action)" @close="$emit('close')">
        <div class="journal-detail">
            <p class="journal-detail__meta">
                <MvDateTimeCell :value="entry.occurredAt" />
                <strong>{{ actor }}</strong>
                <span>{{ source }}</span>
            </p>
            <div v-if="lines.length" class="journal-detail__scroll">
                <table class="journal-detail__changes">
                    <thead>
                        <tr>
                            <th>{{ L.field }}</th>
                            <th>{{ L.before }}</th>
                            <th>{{ L.after }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="line in lines" :key="line.field">
                            <td>{{ line.field }}</td>
                            <td v-if="line.redacted" colspan="2" class="journal-detail__redacted">
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
            <p v-else class="journal-detail__muted">{{ L.noFields }}</p>
        </div>
    </MvModal>
</template>

<style scoped>
.journal-detail {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
}

.journal-detail__meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
    margin: 0;
    font-size: 13px;
    overflow-wrap: anywhere;
}

.journal-detail__scroll {
    overflow-x: auto;
}

.journal-detail__changes {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}

.journal-detail__changes th {
    text-align: left;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--app-nav-label);
    padding: 4px 8px;
    border-bottom: 1px solid var(--app-nav-border);
}

.journal-detail__changes td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--app-nav-border);
    vertical-align: top;
    overflow-wrap: anywhere;
}

.journal-detail__redacted,
.journal-detail__muted {
    font-style: italic;
    color: var(--app-nav-label);
}
</style>
