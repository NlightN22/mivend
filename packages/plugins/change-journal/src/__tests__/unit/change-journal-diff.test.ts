import { describe, expect, it } from 'vitest';

import {
    isSecretField,
    normalizeValue,
    snapshotChanges,
    updateChanges,
    type JournalColumn,
} from '../../change-journal-diff';

function column(propertyPath: string, flags: Partial<JournalColumn> = {}): JournalColumn {
    return {
        propertyPath,
        isCreateDate: false,
        isUpdateDate: false,
        isVersion: false,
        getEntityValue: (e: object) =>
            propertyPath
                .split('.')
                .reduce<unknown>((v, k) => (v as Record<string, unknown>)?.[k], e),
        ...flags,
    };
}

describe('isSecretField', () => {
    it.each([
        'passwordHash',
        'verificationToken',
        'passwordResetToken',
        'identifierChangeToken',
        'secretEncrypted',
        'tokenHash',
        'apiKeyHash',
        'customFields.apiKey',
        'totpSecret',
        'recoveryCodes',
        'claim_token',
        'privateKey',
        'salt',
    ])('%s is a secret', path => expect(isSecretField(path)).toBe(true));

    it.each(['name', 'code', 'footprint', 'identifier', 'tokenizedName2', 'hashtagless', 'email'])(
        '%s is not a secret',
        path => expect(isSecretField(path)).toBe(false),
    );
});

describe('snapshotChanges', () => {
    it('records every set column and keeps a secret value out entirely', () => {
        const columns = [
            column('id'),
            column('name'),
            column('passwordHash'),
            column('note'),
            column('createdAt', { isCreateDate: true }),
            column('updatedAt', { isUpdateDate: true }),
        ];
        const entity = {
            id: 7,
            name: 'a',
            passwordHash: 'h$secret-value',
            note: null,
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        const changes = snapshotChanges(columns, entity, 'after');
        expect(changes).toEqual({
            id: { after: 7 },
            name: { after: 'a' },
            passwordHash: { redacted: true },
        });
        expect(JSON.stringify(changes)).not.toContain('secret-value');
    });
});

describe('updateChanges', () => {
    const columns = [column('name'), column('customFields.note'), column('verificationToken')];

    it('keeps only columns whose value changed, with before and after', () => {
        const before = { name: 'old', customFields: { note: 'same' }, verificationToken: 't1' };
        const after = { name: 'new', customFields: { note: 'same' }, verificationToken: 't2' };
        expect(updateChanges(columns, [], after, before)).toEqual({
            name: { before: 'old', after: 'new' },
            verificationToken: { redacted: true },
        });
    });

    it('records relation ids, not related objects', () => {
        const rel = {
            propertyPath: 'channel',
            getEntityValue: (e: object) => (e as { channel: unknown }).channel,
        };
        expect(
            updateChanges([], [rel], { channel: { id: 2, code: 'x' } }, { channel: { id: 1 } }),
        ).toEqual({
            channel: { before: 1, after: 2 },
        });
    });

    it('without a loaded row records the new values only', () => {
        expect(updateChanges([column('name')], [], { name: 'n' }, undefined)).toEqual({
            name: { after: 'n' },
        });
    });

    it('an update that changes nothing yields no fields', () => {
        expect(updateChanges([column('name')], [], { name: 'n' }, { name: 'n' })).toEqual({});
    });
});

describe('normalizeValue', () => {
    it('serializes dates, bigint and long strings', () => {
        expect(normalizeValue(new Date('2026-01-02T03:04:05Z'))).toBe('2026-01-02T03:04:05.000Z');
        expect(normalizeValue(10n)).toBe('10');
        expect(String(normalizeValue('x'.repeat(5000)))).toMatch(/\[truncated 5000 chars\]$/);
        expect(normalizeValue({ big: 'y'.repeat(5000) })).toMatch(/^\[truncated/);
        expect(normalizeValue([1, 2])).toEqual([1, 2]);
        expect(normalizeValue(undefined)).toBeNull();
    });
});

describe('normalizeValue on JSON payloads', () => {
    it('masks secret keys at any depth by the same word rule', () => {
        const metadata = {
            public: { receipt: 'r-1' },
            gateway: { apiKey: 'k-123', nested: [{ accessToken: 't-456', amount: 5 }] },
            password: 'p-789',
        };
        const out = normalizeValue(metadata);
        expect(out).toEqual({
            public: { receipt: 'r-1' },
            gateway: { apiKey: '[redacted]', nested: [{ accessToken: '[redacted]', amount: 5 }] },
            password: '[redacted]',
        });
        expect(JSON.stringify(out)).not.toMatch(/k-123|t-456|p-789/);
    });

    it('a cyclic object becomes a marker instead of throwing', () => {
        const a: Record<string, unknown> = { name: 'a' };
        a.self = a;
        expect(normalizeValue([a])).toBe('[unserializable]');
    });

    it('a shared, non-cyclic reference is kept', () => {
        const shared = { v: 1 };
        expect(normalizeValue([shared, shared])).toEqual([{ v: 1 }, { v: 1 }]);
    });

    it('strips NUL characters that jsonb rejects, at any depth', () => {
        expect(normalizeValue('a\u0000b')).toBe('ab');
        expect(normalizeValue({ n: ['x\u0000'] })).toEqual({ n: ['x'] });
    });
});

describe('snapshotChanges with a JSON column', () => {
    it('masks nested secrets of an object column such as payment metadata', () => {
        const changes = snapshotChanges(
            [column('metadata')],
            { metadata: { transactionToken: 'tok', status: 'ok' } },
            'after',
        );
        expect(changes).toEqual({
            metadata: { after: { transactionToken: '[redacted]', status: 'ok' } },
        });
    });
});
