import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ status: vi.fn() }));
vi.mock('../api/legal', () => ({ fetchLegalStatus: api.status, acceptLegal: vi.fn() }));

import { needsLegalConfirmation } from '../pages/auth/signInLegal';

const status = (kind: string, required: boolean, pending: boolean) => ({
    kind,
    version: 1,
    required,
    accepted: !pending,
    pending,
});

describe('needsLegalConfirmation', () => {
    beforeEach(() => {
        setActivePinia(createPinia());
        api.status.mockReset();
    });

    it('asks when a required document is unanswered', async () => {
        api.status.mockResolvedValue([status('agreement', true, true)]);
        expect(await needsLegalConfirmation('5')).toBe(true);
    });

    it('does not ask a customer who answered every required document', async () => {
        api.status.mockResolvedValue([status('agreement', true, false)]);
        expect(await needsLegalConfirmation('5')).toBe(false);
    });

    it('never stops a sign-in for an optional document alone', async () => {
        api.status.mockResolvedValue([status('marketing-consent', false, true)]);
        expect(await needsLegalConfirmation('5')).toBe(false);
    });

    it('lets the sign-in through when the status cannot be read', async () => {
        api.status.mockRejectedValue(new Error('down'));
        expect(await needsLegalConfirmation('5')).toBe(false);
    });
});
