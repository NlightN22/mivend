export type StepperOutcome = { kind: 'confirm-remove' } | { kind: 'save'; quantity: number } | null;

// The lowest value the stepper may reach: zero asks to remove the line, the last line stays at one pack.
export function stepperMin(canRemove: boolean, step: number): number {
    return canRemove ? 0 : step;
}

export function stepperOutcome(value: number, current: number, canRemove: boolean): StepperOutcome {
    if (value === 0) return canRemove ? { kind: 'confirm-remove' } : null;
    return value === current ? null : { kind: 'save', quantity: value };
}
