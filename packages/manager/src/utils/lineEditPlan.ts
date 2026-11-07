export interface LineDraft {
    quantity: number;
    unitPrice: string;
    justification: string;
}

export interface LineOriginal {
    quantity: number;
    unitPriceMinor: number;
}

export interface LineCapabilities {
    canEditQuantity: boolean;
    canEditPrice: boolean;
    canRemove: boolean;
}

export type LineEditOp =
    | { kind: 'quantity'; quantity: number }
    | { kind: 'remove' }
    | { kind: 'price'; requestedPrice: number; justification?: string };

export interface LineEditPlan {
    ops: LineEditOp[];
    error: string | null;
}

export function initialDraft(original: LineOriginal): LineDraft {
    return {
        quantity: original.quantity,
        unitPrice: (original.unitPriceMinor / 100).toFixed(2),
        justification: '',
    };
}

// A removed line takes no price change: it is gone, so the quantity step decides alone.
export function planLineEdit(
    original: LineOriginal,
    draft: LineDraft,
    caps: LineCapabilities,
): LineEditPlan {
    const ops: LineEditOp[] = [];
    if (caps.canEditQuantity && draft.quantity !== original.quantity) {
        if (draft.quantity === 0) {
            return caps.canRemove
                ? { ops: [{ kind: 'remove' }], error: null }
                : { ops, error: 'The last line cannot be removed' };
        }
        ops.push({ kind: 'quantity', quantity: draft.quantity });
    }
    if (caps.canEditPrice) {
        const price = Number(draft.unitPrice);
        if (draft.unitPrice.trim() === '' || Number.isNaN(price) || price < 0) {
            return { ops: [], error: 'Enter a valid price' };
        }
        const requestedPrice = Math.round(price * 100);
        if (requestedPrice !== original.unitPriceMinor) {
            const justification = draft.justification.trim();
            ops.push({
                kind: 'price',
                requestedPrice,
                justification: justification || undefined,
            });
        }
    }
    return { ops, error: null };
}
