import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ status: vi.fn(), offer: vi.fn() }));

vi.mock('vue-i18n', () => ({ useI18n: () => ({ locale: { value: 'en' } }) }));
vi.mock('../stores/auth', () => ({
    useAuthStore: () => ({ customer: { emailAddress: 'a@b.c' } }),
}));
vi.mock('../api/legal', () => ({
    fetchLegalOffer: api.offer,
    fetchLegalStatus: api.status,
    acceptLegal: vi.fn(),
}));

import { useLoginConsents } from '../pages/auth/useLoginConsents';

const status = (kind: string, pending: boolean) => ({
    kind,
    version: 2,
    required: true,
    accepted: !pending,
    pending,
});

describe('useLoginConsents', () => {
    beforeEach(() => setActivePinia(createPinia()));

    it('narrows the boxes to the documents still awaiting acceptance', async () => {
        api.offer.mockResolvedValue(
            ['agreement', 'personal-data-consent'].map(kind => ({
                kind,
                version: 2,
                requiredVersion: 2,
                required: true,
            })),
        );
        api.status.mockResolvedValue([
            status('agreement', false),
            status('personal-data-consent', true),
        ]);
        const consents = useLoginConsents();
        await consents.load();
        expect(consents.checks.value).toHaveLength(2);
        expect(await consents.settle('1')).toBe(false);
        expect(consents.checks.value.map(c => c.kind)).toEqual(['personal-data-consent']);
        await consents.load();
        expect(consents.checks.value.map(c => c.kind)).toEqual(['personal-data-consent']);
    });
});
