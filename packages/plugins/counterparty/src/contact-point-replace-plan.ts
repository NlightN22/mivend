import type { ContactPointType, ContactSource } from './entities/contact-point.entity';
import type { ResolvedContactPoint } from './contact-point-normalize';
import { contactPointKey } from './contact-point-normalize';

export interface StoredContactPoint {
    id: number;
    linkId: number;
    type: ContactPointType;
    value: string;
    normalizedValue: string | null;
    isUsable: boolean;
    label: string | null;
    comment: string | null;
    source: ContactSource;
    isPrimary: boolean;
}

export interface ContactPointReplacePlan {
    insert: ResolvedContactPoint[];
    updatePoint: Array<{ id: number; point: ResolvedContactPoint }>;
    updateLink: Array<{ linkId: number; isPrimary: boolean }>;
    deleteIds: number[];
}

// Only ERP rows are ever changed or deleted; a manual row equal to an incoming one stays as it is.
// Unchanged rows produce no write at all.
export function planContactPointReplace(
    stored: readonly StoredContactPoint[],
    incoming: readonly ResolvedContactPoint[],
): ContactPointReplacePlan {
    const storedByKey = new Map(
        stored.map(s => [contactPointKey(s.type, s.normalizedValue, s.value), s]),
    );
    const incomingKeys = new Set(incoming.map(p => p.key));
    const plan: ContactPointReplacePlan = {
        insert: [],
        updatePoint: [],
        updateLink: [],
        deleteIds: [],
    };
    for (const point of incoming) {
        const existing = storedByKey.get(point.key);
        if (!existing) plan.insert.push(point);
        else if (existing.source === 'erp') {
            if (pointChanged(existing, point)) plan.updatePoint.push({ id: existing.id, point });
            if (existing.isPrimary !== point.isPrimary) {
                plan.updateLink.push({ linkId: existing.linkId, isPrimary: point.isPrimary });
            }
        }
    }
    for (const [key, row] of storedByKey) {
        if (row.source === 'erp' && !incomingKeys.has(key)) plan.deleteIds.push(row.id);
    }
    return plan;
}

function pointChanged(stored: StoredContactPoint, point: ResolvedContactPoint): boolean {
    return (
        stored.value !== point.value ||
        stored.isUsable !== point.isUsable ||
        stored.label !== point.label ||
        stored.comment !== point.comment
    );
}
