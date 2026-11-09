import type { ContactPointType, ContactSource } from './entities/contact-point.entity';
import type { ResolvedContactPoint } from './contact-point-normalize';
import { contactPointKey } from './contact-point-normalize';

export interface StoredContactPoint {
    id: number;
    type: ContactPointType;
    value: string;
    normalizedValue: string | null;
    source: ContactSource;
}

export interface ContactPointReplacePlan {
    insert: ResolvedContactPoint[];
    update: Array<{ id: number; point: ResolvedContactPoint }>;
    deleteIds: number[];
}

// ERP rows missing from the list are deleted, manual rows never; a manual row equal to an ERP one becomes that ERP row.
export function planContactPointReplace(
    stored: readonly StoredContactPoint[],
    incoming: readonly ResolvedContactPoint[],
): ContactPointReplacePlan {
    const storedByKey = new Map(
        stored.map(s => [contactPointKey(s.type, s.normalizedValue, s.value), s]),
    );
    const incomingKeys = new Set(incoming.map(p => p.key));
    const plan: ContactPointReplacePlan = { insert: [], update: [], deleteIds: [] };
    for (const point of incoming) {
        const existing = storedByKey.get(point.key);
        if (existing) plan.update.push({ id: existing.id, point });
        else plan.insert.push(point);
    }
    for (const [key, row] of storedByKey) {
        if (row.source === 'erp' && !incomingKeys.has(key)) plan.deleteIds.push(row.id);
    }
    return plan;
}
