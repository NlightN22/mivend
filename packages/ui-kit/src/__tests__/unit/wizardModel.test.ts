import { describe, expect, it } from 'vitest';

import {
    canJumpTo,
    nextKey,
    previousKey,
    stepIndex,
    stepStates,
} from '../../components/MvWizard/wizardModel';

const steps = ['select', 'parameters', 'review', 'run'].map(key => ({ key, label: key }));

describe('wizard model', () => {
    it('marks earlier steps done, the current one current and the rest upcoming', () => {
        expect(stepStates(steps, 'review')).toEqual(['done', 'done', 'current', 'upcoming']);
    });

    it('falls back to the first step for an unknown key', () => {
        expect(stepIndex(steps, 'nope')).toBe(0);
    });

    it('finds the neighbours and stops at both ends', () => {
        expect(previousKey(steps, 'select')).toBeNull();
        expect(previousKey(steps, 'review')).toBe('parameters');
        expect(nextKey(steps, 'review')).toBe('run');
        expect(nextKey(steps, 'run')).toBeNull();
    });

    it('lets the header go back to a finished step but never forward', () => {
        expect(canJumpTo(steps, 'review', 'select')).toBe(true);
        expect(canJumpTo(steps, 'review', 'review')).toBe(false);
        expect(canJumpTo(steps, 'review', 'run')).toBe(false);
    });
});
