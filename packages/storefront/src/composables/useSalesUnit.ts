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

// Mirrors plugin-moq's wholePackQuantity; null (no whole multiple) means the unit is not enforced.
function wholePackStep(ratio: number): number | null {
    for (let packs = 1; packs <= MAX_PACKS_FOR_WHOLE_QUANTITY; packs++) {
        const base = packs * ratio;
        if (Math.abs(base - Math.round(base)) < 1e-9) return packs;
    }
    return null;
}

// Null when the variant is sold by the piece, or the branch does not sell by packages only.
export function salesUnitOf(
    variant: SalesUnitVariant | null | undefined,
    packagesOnly: boolean,
): SalesUnitView | null {
    const ratio = variant?.unitRatioToBase;
    if (!packagesOnly || !variant?.unitName || !ratio || ratio <= 0 || ratio === 1) return null;
    const packStep = wholePackStep(ratio);
    return packStep === null ? null : { name: variant.unitName, ratio, packStep };
}

export const packsToBase = (packs: number, unit: SalesUnitView): number =>
    Math.round(packs * unit.ratio);

export const baseToPacks = (base: number, unit: SalesUnitView): number =>
    Math.round((base / unit.ratio) * 1e6) / 1e6;

// Rounds up so a repeated order never asks for less than the original; at least one step.
export const roundUpToWholePacks = (base: number, unit: SalesUnitView): number => {
    const stepBase = packsToBase(unit.packStep, unit);
    return Math.max(1, Math.ceil(base / stepBase)) * stepBase;
};

export interface PackagingLevel {
    name: string;
    ratioToBase: number;
}

// The smallest pack strictly above the unit the item is sold in, so the same pack is never shown twice.
export function nextPackAbove(
    variant: SalesUnitVariant | null | undefined,
    levels: PackagingLevel[],
    soldRatio: number,
): { name: string; ratio: number; baseQty: number } | null {
    const candidates = [
        ...(variant?.unitName && variant.unitRatioToBase
            ? [{ name: variant.unitName, ratioToBase: variant.unitRatioToBase }]
            : []),
        ...levels,
    ]
        .filter(c => c.ratioToBase > soldRatio)
        .sort((a, b) => a.ratioToBase - b.ratioToBase);
    for (const c of candidates) {
        const step = wholePackStep(c.ratioToBase);
        if (step !== null) {
            return {
                name: c.name,
                ratio: c.ratioToBase,
                baseQty: Math.round(step * c.ratioToBase),
            };
        }
    }
    return null;
}

// The pack offered next to piece sale: the variant's own default unit, else the smallest level above 1.
export function nearestPackOf(
    variant: SalesUnitVariant | null | undefined,
    levels: PackagingLevel[],
): { name: string; ratio: number; baseQty: number } | null {
    const candidates = [
        ...(variant?.unitName && variant.unitRatioToBase
            ? [{ name: variant.unitName, ratioToBase: variant.unitRatioToBase }]
            : []),
        ...levels,
    ];
    for (const c of candidates) {
        const step = c.ratioToBase > 1 ? wholePackStep(c.ratioToBase) : null;
        if (step !== null) {
            return {
                name: c.name,
                ratio: c.ratioToBase,
                baseQty: Math.round(step * c.ratioToBase),
            };
        }
    }
    return null;
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
