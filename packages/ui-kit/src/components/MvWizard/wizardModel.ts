export interface WizardStep {
    key: string;
    label: string;
    description?: string;
}

export type WizardStepState = 'done' | 'current' | 'upcoming';

export function stepIndex(steps: WizardStep[], key: string): number {
    return Math.max(
        0,
        steps.findIndex(s => s.key === key),
    );
}

export function stepStates(steps: WizardStep[], current: string): WizardStepState[] {
    const at = stepIndex(steps, current);
    return steps.map((_, i) => (i < at ? 'done' : i === at ? 'current' : 'upcoming'));
}

export function previousKey(steps: WizardStep[], current: string): string | null {
    const at = stepIndex(steps, current);
    return at > 0 ? steps[at - 1].key : null;
}

export function nextKey(steps: WizardStep[], current: string): string | null {
    const at = stepIndex(steps, current);
    return at < steps.length - 1 ? steps[at + 1].key : null;
}

// A finished step can be revisited from the header, a later one only through Next.
export function canJumpTo(steps: WizardStep[], current: string, target: string): boolean {
    return stepIndex(steps, target) < stepIndex(steps, current);
}
