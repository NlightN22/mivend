// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { acceptanceRemembered, fingerprint, rememberAcceptance } from '../pages/auth/legalMemory';

const required = [
    { kind: 'agreement', requiredVersion: 1 },
    { kind: 'personal-data-consent', requiredVersion: 1 },
];

describe('browser memory of an accepted document set', () => {
    beforeEach(() => localStorage.clear());

    it('knows nothing until an acceptance is stored for that identifier', () => {
        expect(acceptanceRemembered('a@example.com', required)).toBe(false);
        rememberAcceptance(
            ['a@example.com'],
            [
                { kind: 'agreement', version: 1 },
                { kind: 'personal-data-consent', version: 1 },
            ],
        );
        expect(acceptanceRemembered('A@Example.com ', required)).toBe(true);
        expect(acceptanceRemembered('b@example.com', required)).toBe(false);
    });

    it('keeps the hint through a minor edit and drops it for a re-acceptance version', () => {
        rememberAcceptance(['a@example.com'], [{ kind: 'agreement', version: 1 }]);
        const minor = [{ kind: 'agreement', requiredVersion: 1 }];
        const reaccept = [{ kind: 'agreement', requiredVersion: 2 }];
        expect(acceptanceRemembered('a@example.com', minor)).toBe(true);
        expect(acceptanceRemembered('a@example.com', reaccept)).toBe(false);
    });

    it('stores a fingerprint, never the address', () => {
        rememberAcceptance(['a@example.com'], [{ kind: 'agreement', version: 1 }]);
        expect(localStorage.getItem('mv.legalAccepted')).not.toContain('example.com');
        expect(fingerprint('a@example.com')).toBe(fingerprint(' A@EXAMPLE.com'));
    });

    it('does not throw when storage is blocked', () => {
        const setItem = Storage.prototype.setItem;
        Storage.prototype.setItem = (): void => {
            throw new Error('blocked');
        };
        try {
            expect(() => rememberAcceptance(['a@example.com'], [])).not.toThrow();
        } finally {
            Storage.prototype.setItem = setItem;
        }
    });
});
