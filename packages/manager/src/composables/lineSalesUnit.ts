interface UnitVariantFields {
    unitName: string | null;
    unitRatioToBase: number | null;
}

// "10 pack (= 100)" for a package-only order line, the plain base quantity otherwise.
export function formatLineQuantity(
    quantity: number,
    fields: UnitVariantFields | null | undefined,
    packagesOnly: boolean,
): string {
    const ratio = fields?.unitRatioToBase;
    if (!packagesOnly || !fields?.unitName || !ratio || ratio <= 0 || ratio === 1) {
        return String(quantity);
    }
    const packs = Math.round((quantity / ratio) * 1e3) / 1e3;
    return `${packs} ${fields.unitName} (= ${quantity})`;
}
