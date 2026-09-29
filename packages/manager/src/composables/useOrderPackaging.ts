interface PackagingLine {
    quantity: number;
    productVariant: {
        customFields: {
            unitRatioToBase: number | null;
            unitWeightKg: number | null;
            unitVolumeL: number | null;
        };
    };
}

export interface OrderPackagingTotals {
    totalWeightKg: number;
    totalVolumeL: number;
}

// A line with no unitRatioToBase/unitWeightKg/unitVolumeL is a plain per-piece item with no
// packaging unit (see docs/order-flow.md#mivend-103) — it contributes 0, not excluded from the sum.
function lineWeightKg(line: PackagingLine): number {
    const cf = line.productVariant.customFields;
    if (!cf.unitRatioToBase || cf.unitWeightKg == null) return 0;
    return (cf.unitWeightKg / cf.unitRatioToBase) * line.quantity;
}

function lineVolumeL(line: PackagingLine): number {
    const cf = line.productVariant.customFields;
    if (!cf.unitRatioToBase || cf.unitVolumeL == null) return 0;
    return (cf.unitVolumeL / cf.unitRatioToBase) * line.quantity;
}

export function useOrderPackaging(lines: PackagingLine[]): OrderPackagingTotals {
    return {
        totalWeightKg: lines.reduce((sum, line) => sum + lineWeightKg(line), 0),
        totalVolumeL: lines.reduce((sum, line) => sum + lineVolumeL(line), 0),
    };
}
