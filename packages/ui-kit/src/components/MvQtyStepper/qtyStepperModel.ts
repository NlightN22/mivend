export interface QtyLimits {
    min: number;
    max?: number;
    step: number;
}

export interface QtyParse {
    value: number | null;
    error: string | null;
}

// Typed text becomes a quantity only when it is a whole number inside the limits and on the pack multiple.
export function parseQuantity(text: string, limits: QtyLimits): QtyParse {
    const trimmed = text.trim();
    if (!/^\d+$/.test(trimmed)) return { value: null, error: 'Enter a whole number' };
    const value = Number(trimmed);
    if (value < limits.min) return { value: null, error: `At least ${limits.min}` };
    if (limits.max !== undefined && value > limits.max) {
        return { value: null, error: `At most ${limits.max}` };
    }
    if (limits.step > 1 && value % limits.step !== 0) {
        return { value: null, error: `A multiple of ${limits.step}` };
    }
    return { value, error: null };
}
