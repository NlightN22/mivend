import { Logger } from '@vendure/core';
import type { RequestContext } from '@vendure/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    BreachCheckedPasswordValidationStrategy,
    PASSWORD_BREACHED_MESSAGE,
} from '../../breach/breach-checked-password-validation';
import type { BreachVerdict } from '../../breach/breached-password-checker';

const ctx = {} as RequestContext;

function strategy(inner: boolean | string, verdict: BreachVerdict) {
    const check = vi.fn(async () => verdict);
    return {
        check,
        strategy: new BreachCheckedPasswordValidationStrategy({ validate: () => inner }, { check }),
    };
}

afterEach(() => vi.restoreAllMocks());

describe('BreachCheckedPasswordValidationStrategy', () => {
    it('rejects a confirmed hit', async () => {
        expect(await strategy(true, 'breached').strategy.validate(ctx, 'pw')).toBe(
            PASSWORD_BREACHED_MESSAGE,
        );
    });

    it('accepts a clean password', async () => {
        expect(await strategy(true, 'clean').strategy.validate(ctx, 'pw')).toBe(true);
    });

    it('accepts and logs when the lookup is unavailable', async () => {
        const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
        expect(await strategy(true, 'unavailable').strategy.validate(ctx, 'pw')).toBe(true);
        expect(warn).toHaveBeenCalledOnce();
    });

    it('keeps the wrapped rules first and skips the lookup when they fail', async () => {
        const { strategy: s, check } = strategy('too short', 'breached');
        expect(await s.validate(ctx, 'pw')).toBe('too short');
        expect(check).not.toHaveBeenCalled();
    });
});
