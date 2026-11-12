import type { ChangeJournalEntry } from '../api/changeJournal';
import {
    ACTION_LABELS,
    ACTOR_TYPE_LABELS,
    CHANGE_JOURNAL_LABELS,
    ENTITY_TYPE_LABELS,
    SOURCE_LABELS,
} from '../components/change-journal/changeJournalLabels';
import { tr } from './lazyLabels';

export type AdminNameLookup = (administratorId: string) => string | null;

export interface ChangeLine {
    field: string;
    before: string;
    after: string;
    redacted: boolean;
}

function adminLabel(id: string | null, lookup: AdminNameLookup): string {
    if (!id) return '#?';
    return lookup(id) ?? `#${id}`;
}

export function formatActor(entry: ChangeJournalEntry, lookup: AdminNameLookup): string {
    const user = entry.userId
        ? tr('changeJournal.actor.user', { id: entry.userId })
        : tr('changeJournal.actor.userUnknown');
    switch (entry.actorType) {
        case 'administrator':
            return `${ACTOR_TYPE_LABELS.administrator}: ${adminLabel(entry.administratorId, lookup)}`;
        case 'customer':
            return `${ACTOR_TYPE_LABELS.customer}: ${user}`;
        case 'acting':
            return tr('changeJournal.actor.acting', {
                admin: adminLabel(entry.administratorId, lookup),
                user,
            });
        case 'system':
            return ACTOR_TYPE_LABELS.system;
        default:
            return entry.actorType;
    }
}

export function formatSource(source: string): string {
    if (source === 'background') return SOURCE_LABELS.background;
    if (source.startsWith('scheduled-task:')) {
        return `${SOURCE_LABELS.scheduledTask}: ${source.slice('scheduled-task:'.length)}`;
    }
    const rest = /^(admin|shop)-api:rest:(.+)$/.exec(source);
    if (rest) return `${SOURCE_LABELS.rest}: ${rest[2]}`;
    const api = /^(admin|shop)-api:(.+)$/.exec(source);
    if (api) {
        return `${api[1] === 'admin' ? SOURCE_LABELS.adminApi : SOURCE_LABELS.shopApi}: ${api[2]}`;
    }
    return source;
}

export function formatAction(action: string): string {
    return ACTION_LABELS[action] ?? action;
}

export function formatEntityType(entityType: string): string {
    return ENTITY_TYPE_LABELS[entityType] ?? entityType;
}

export function formatValue(value: unknown): string {
    if (value === null || value === undefined || value === '')
        return CHANGE_JOURNAL_LABELS.emptyValue;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function changeLines(changes: unknown): ChangeLine[] {
    if (!isRecord(changes)) return [];
    return Object.entries(changes).map(([field, diff]) => {
        if (isRecord(diff) && diff.redacted === true) {
            const text = CHANGE_JOURNAL_LABELS.redacted;
            return { field, before: text, after: text, redacted: true };
        }
        const pair = isRecord(diff) ? diff : {};
        return {
            field,
            before: formatValue(pair.before),
            after: formatValue(pair.after),
            redacted: false,
        };
    });
}
