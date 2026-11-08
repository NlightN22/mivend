export interface QtyLimits {
    min: number;
    max?: number;
    step: number;
}

export type QtyErrorCode = 'whole' | 'min' | 'max' | 'multiple';

export interface QtyParse {
    value: number | null;
    error: QtyErrorCode | null;
}

// Typed text becomes a quantity only when it is a whole number inside the limits and on the pack multiple.
export function parseQuantity(text: string, limits: QtyLimits): QtyParse {
    const trimmed = text.trim();
    if (!/^\d+$/.test(trimmed)) return { value: null, error: 'whole' };
    const value = Number(trimmed);
    if (value < limits.min) return { value: null, error: 'min' };
    if (limits.max !== undefined && value > limits.max) {
        return { value: null, error: 'max' };
    }
    if (limits.step > 1 && value % limits.step !== 0) {
        return { value: null, error: 'multiple' };
    }
    return { value, error: null };
}

// Confirm mode keeps the original rule; live mode also disables a step that would land below the minimum.
export function decreaseDisabled(value: number, limits: QtyLimits, live: boolean): boolean {
    return live ? value - limits.step < limits.min : value <= limits.min;
}
