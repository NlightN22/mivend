import type { ProformaCardVersion } from '../api/proformaInvoiceCard';

export interface VersionChange {
    amountDelta: number;
    added: number;
    removed: number;
    changed: number;
}

type Line = ProformaCardVersion['lines'][number];

const net = (line: Line): number => line.linePriceWithTax - line.discountAmount;

// Lines are matched by SKU; a change is a different quantity or line total.
export function versionChange(
    previous: ProformaCardVersion,
    next: ProformaCardVersion,
): VersionChange {
    const before = new Map(previous.lines.map(l => [l.productVariant.sku, l]));
    const after = new Map(next.lines.map(l => [l.productVariant.sku, l]));
    let changed = 0;
    for (const [sku, line] of after) {
        const old = before.get(sku);
        if (old && (old.quantity !== line.quantity || net(old) !== net(line))) changed += 1;
    }
    return {
        amountDelta: next.amount - previous.amount,
        added: [...after.keys()].filter(sku => !before.has(sku)).length,
        removed: [...before.keys()].filter(sku => !after.has(sku)).length,
        changed,
    };
}

export interface TimelineEntry {
    version: ProformaCardVersion;
    change: VersionChange | null;
}

// Newest first, as the server returns them; the oldest version has nothing to compare with.
export function timelineEntries(versions: ProformaCardVersion[]): TimelineEntry[] {
    return versions.map((version, i) => {
        const previous = versions[i + 1];
        return { version, change: previous ? versionChange(previous, version) : null };
    });
}
