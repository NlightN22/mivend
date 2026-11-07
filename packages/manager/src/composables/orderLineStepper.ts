// The lowest value the stepper may reach: zero removes the line, the last line stays at one pack.
export function stepperMin(canRemove: boolean, step: number): number {
    return canRemove ? 0 : step;
}
