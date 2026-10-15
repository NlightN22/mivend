export interface DistributableLine {
    id: string;
    quantity: number;
}

// The ERP reports one quantity per order and variant; fill the order's lines of that variant in
// id order up to each line's quantity, the remainder (if any) lands on the last line.
export function distributeErpReserve(
    lines: DistributableLine[],
    reserved: number,
): Map<string, number> {
    const shares = new Map<string, number>();
    let remaining = reserved;
    for (const line of [...lines].sort((a, b) => Number(a.id) - Number(b.id))) {
        const share = Math.min(remaining, line.quantity);
        if (share > 0) shares.set(line.id, share);
        remaining -= share;
    }
    const last = lines.reduce<DistributableLine | undefined>(
        (max, l) => (max && Number(max.id) > Number(l.id) ? max : l),
        undefined,
    );
    if (remaining > 0 && last) shares.set(last.id, (shares.get(last.id) ?? 0) + remaining);
    return shares;
}
