interface PackagingLine {
    quantity: number;
    productVariant: {
        customFields: {
            unitRatioToBase: number | null;
            unitWeightKg: number | null;
            unitVolumeM3: number | null;
        };
    };
}

export interface OrderPackagingTotals {
    totalWeightKg: number;
    totalVolumeM3: number;
}

// A line with no unitRatioToBase/unitWeightKg/unitVolumeM3 is a plain per-piece item with no
// packaging unit (see docs/order-flow.md#mivend-103) — it contributes 0, not excluded from the sum.
function lineWeightKg(line: PackagingLine): number {
    const cf = line.productVariant.customFields;
    if (!cf.unitRatioToBase || cf.unitWeightKg == null) return 0;
    return (cf.unitWeightKg / cf.unitRatioToBase) * line.quantity;
}

function lineVolumeM3(line: PackagingLine): number {
    const cf = line.productVariant.customFields;
    if (!cf.unitRatioToBase || cf.unitVolumeM3 == null) return 0;
    return (cf.unitVolumeM3 / cf.unitRatioToBase) * line.quantity;
}

export function useOrderPackaging(lines: PackagingLine[]): OrderPackagingTotals {
    return {
        totalWeightKg: lines.reduce((sum, line) => sum + lineWeightKg(line), 0),
        totalVolumeM3: lines.reduce((sum, line) => sum + lineVolumeM3(line), 0),
    };
}

function formatVolumeM3(volumeM3: number): string {
    return volumeM3 < 0.001 ? '< 0.001 m³' : `${volumeM3.toFixed(3)} m³`;
}

// Unknown volume is summed as 0, so it is left out rather than shown as a misleading "0.000".
export function formatPackaging(totals: OrderPackagingTotals): string | null {
    const { totalWeightKg, totalVolumeM3 } = totals;
    if (totalWeightKg === 0 && totalVolumeM3 === 0) return null;
    const weight = `${totalWeightKg.toFixed(1)} kg`;
    return totalVolumeM3 > 0 ? `${weight} · ${formatVolumeM3(totalVolumeM3)}` : weight;
}
