export interface SalesUnitVariant {
    unitName?: string | null;
    unitRatioToBase?: number | null;
}

export interface SalesUnitView {
    name: string;
    ratio: number;
    // Smallest whole number of packs that is also a whole base quantity (ratio 0.9 -> 10 packs).
    packStep: number;
}

const MAX_PACKS_FOR_WHOLE_QUANTITY = 1000;

function wholePackStep(ratio: number): number {
    for (let packs = 1; packs <= MAX_PACKS_FOR_WHOLE_QUANTITY; packs++) {
        const base = packs * ratio;
        if (Math.abs(base - Math.round(base)) < 1e-9) return packs;
    }
    return 1;
}

// Null when the variant is sold by the piece, or the branch does not sell by packages only.
export function salesUnitOf(
    variant: SalesUnitVariant | null | undefined,
    packagesOnly: boolean,
): SalesUnitView | null {
    const ratio = variant?.unitRatioToBase;
    if (!packagesOnly || !variant?.unitName || !ratio || ratio <= 0 || ratio === 1) return null;
    return { name: variant.unitName, ratio, packStep: wholePackStep(ratio) };
}

export const packsToBase = (packs: number, unit: SalesUnitView): number =>
    Math.round(packs * unit.ratio);

export const baseToPacks = (base: number, unit: SalesUnitView): number =>
    Math.round((base / unit.ratio) * 1e6) / 1e6;

export interface PackagingLevel {
    name: string;
    ratioToBase: number;
}

// The pack offered next to piece sale: the variant's own default unit, else the smallest level above 1.
export function nearestPackOf(
    variant: SalesUnitVariant | null | undefined,
    levels: PackagingLevel[],
): { name: string; ratio: number } | null {
    if (variant?.unitName && variant.unitRatioToBase && variant.unitRatioToBase > 1) {
        return { name: variant.unitName, ratio: variant.unitRatioToBase };
    }
    const level = levels.find(l => l.ratioToBase > 1);
    return level ? { name: level.name, ratio: level.ratioToBase } : null;
}

// Texts for the product card's Unit / Multiplicity block; empty strings keep the ui-kit defaults.
export function salesUnitLabels(unit: SalesUnitView | null): {
    unit: string;
    multiplicity: string;
} {
    if (!unit) return { unit: 'pc.', multiplicity: '' };
    return {
        unit: unit.name,
        multiplicity: `${unit.packStep} ${unit.name} (= ${packsToBase(unit.packStep, unit)} pc.)`,
    };
}
