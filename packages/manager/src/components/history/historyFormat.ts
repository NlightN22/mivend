import type { EntityVersionRow } from '../../api/history';
import { tr } from '../../utils/lazyLabels';

export const ACTION_BADGE_VARIANT: Record<string, 'success' | 'info' | 'danger' | 'neutral'> = {
    create: 'success',
    update: 'info',
    deactivate: 'danger',
    reactivate: 'success',
};

export interface DiffLine {
    field: string;
    from: string;
    to: string;
}

export function actionLabel(action: string): string {
    const key = `changeJournal.history.action.${action}`;
    const label = tr(key);
    return label === key ? action : label;
}

function parseChangedFields(row: EntityVersionRow): Record<string, { from: unknown; to: unknown }> {
    if (!row.changedFields) return {};
    try {
        return JSON.parse(row.changedFields) as Record<string, { from: unknown; to: unknown }>;
    } catch {
        return {};
    }
}

export function changeSummary(row: EntityVersionRow): string {
    const fields = Object.keys(parseChangedFields(row));
    return fields.length ? fields.join(', ') : '—';
}

// Contacts are logged as full snapshots; render them readably instead of dumping raw JSON.
function formatDiffValue(field: string, value: unknown): string {
    if (field === 'contacts' && Array.isArray(value)) {
        if (value.length === 0) return tr('changeJournal.history.none');
        return value
            .map((c: { name?: string; phone?: string | null }) =>
                c.phone ? `${c.name} (${c.phone})` : String(c.name),
            )
            .join('; ');
    }
    if (value === null || value === undefined || value === '') {
        return tr('changeJournal.history.empty');
    }
    return String(value);
}

export function diffLines(row: EntityVersionRow): DiffLine[] {
    return Object.entries(parseChangedFields(row)).map(([field, diff]) => ({
        field,
        from: formatDiffValue(field, diff.from),
        to: formatDiffValue(field, diff.to),
    }));
}
