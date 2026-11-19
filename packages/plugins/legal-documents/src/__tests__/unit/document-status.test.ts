import { describe, expect, it } from 'vitest';

import { documentStatuses } from '../../document-status';

const v = (
    kind: string,
    version: number,
    requiresReacceptance = true,
): { kind: string; version: number; requiresReacceptance: boolean } => ({
    kind,
    version,
    requiresReacceptance,
});
const base = [
    v('policy', 1),
    v('agreement', 1),
    v('personal-data-consent', 1),
    v('marketing-consent', 1),
];
const pending = (list: ReturnType<typeof documentStatuses>): string[] =>
    list.filter(s => s.pending).map(s => s.kind);

describe('documentStatuses', () => {
    it('asks for everything a customer has never answered, and never for the policy', () => {
        expect(pending(documentStatuses(base, []))).toEqual([
            'agreement',
            'personal-data-consent',
            'marketing-consent',
        ]);
    });

    it('asks for nothing once the current versions are accepted or the optional one declined', () => {
        const records = [
            { kind: 'agreement', version: 1, accepted: true },
            { kind: 'personal-data-consent', version: 1, accepted: true },
            { kind: 'marketing-consent', version: 1, accepted: false },
        ];
        expect(pending(documentStatuses(base, records))).toEqual([]);
    });

    it('asks again after a version that requires re-acceptance', () => {
        const published = [...base, v('agreement', 2)];
        const records = [
            { kind: 'agreement', version: 1, accepted: true },
            { kind: 'personal-data-consent', version: 1, accepted: true },
            { kind: 'marketing-consent', version: 1, accepted: true },
        ];
        expect(pending(documentStatuses(published, records))).toEqual(['agreement']);
    });

    it('keeps an earlier acceptance valid after a minor edit', () => {
        const published = [...base, v('agreement', 2, false)];
        const records = [
            { kind: 'agreement', version: 1, accepted: true },
            { kind: 'personal-data-consent', version: 1, accepted: true },
            { kind: 'marketing-consent', version: 1, accepted: true },
        ];
        expect(pending(documentStatuses(published, records))).toEqual([]);
    });

    it('treats a withdrawn marketing consent as answered, not pending', () => {
        const records = [
            { kind: 'marketing-consent', version: 1, accepted: true },
            { kind: 'marketing-consent', version: 1, accepted: false },
        ];
        const marketing = documentStatuses(base, records).find(s => s.kind === 'marketing-consent');
        expect(marketing).toMatchObject({ accepted: false, pending: false, required: false });
    });

    it('does not ask again when no version is flagged and an earlier one was accepted', () => {
        const published = [v('agreement', 1, false), v('agreement', 2, false)];
        const records = [{ kind: 'agreement', version: 1, accepted: true }];
        expect(pending(documentStatuses(published, records))).not.toContain('agreement');
    });

    it('lists nothing for a kind that has no published version', () => {
        expect(documentStatuses([v('policy', 1)], [])).toEqual([]);
    });
});
