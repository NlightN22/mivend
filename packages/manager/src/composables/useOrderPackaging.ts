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
