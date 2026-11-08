import type { StatusBadgeVariant } from '../MvStatusBadge/MvStatusBadge.vue';

export type DocTone = 'danger' | 'orange' | 'warning';
export type DocStripe = DocTone | 'ok';

export interface DocFlagNote {
    text: string;
    detail?: string;
    badge?: { label: string; variant: StatusBadgeVariant };
}

export interface DocFlagAction {
    key: string;
    label: string;
    variant?: 'primary' | 'secondary';
}

// One finding attached to one cell; a document type fills it from its own checks.
export interface DocFlag {
    tone: DocTone;
    notes: DocFlagNote[];
    actions?: DocFlagAction[];
}

export interface DocColumn {
    key: string;
    label: string;
    hidden?: boolean;
    // The cell turns into inputs while its row is edited, so its flag chip steps aside.
    inputWhenEditing?: boolean;
}

export interface DocRow {
    id: string;
    testId?: string;
    flags?: Record<string, DocFlag | undefined>;
}

const RANK: Record<DocTone, number> = { danger: 3, orange: 2, warning: 1 };

export function worstTone(tones: DocTone[]): DocTone | null {
    return tones.reduce<DocTone | null>(
        (worst, tone) => (worst === null || RANK[tone] > RANK[worst] ? tone : worst),
        null,
    );
}

export function rowStripe(flags: DocRow['flags']): DocStripe {
    const tones = Object.values(flags ?? {}).flatMap(f => (f ? [f.tone] : []));
    return worstTone(tones) ?? 'ok';
}

export function visibleColumns(columns: DocColumn[]): DocColumn[] {
    return columns.filter(c => !c.hidden);
}

// Cells of a selection/actions-aware row: checkbox + product-first columns + actions.
export function columnCount(columns: DocColumn[], selectable: boolean): number {
    return visibleColumns(columns).length + (selectable ? 1 : 0) + 1;
}
