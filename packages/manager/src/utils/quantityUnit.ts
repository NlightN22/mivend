// Muted hint after a quantity: the ERP unit and, for a pack rule, the multiple; nothing without unit data.
export function quantityUnitHint(unitName: string | null | undefined, multiple = 1): string {
    const unit = unitName?.trim() ?? '';
    if (!unit) return '';
    return multiple > 1 ? `${unit} (x${multiple})` : unit;
}

export function multipleMessage(sku: string, multiple: number): string {
    return `${sku} must be ordered in multiples of ${multiple}`;
}

export function notMultiple(quantity: number, multiple: number): boolean {
    return multiple > 1 && quantity % multiple !== 0;
}
