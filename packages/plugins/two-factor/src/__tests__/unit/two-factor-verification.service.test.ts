import { randomBytes } from 'node:crypto';
import { Logger } from '@vendure/core';
import type { AuthService } from '@vendure/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FactorStoreService } from '../../factor-store.service';
import { encryptSecret } from '../../secret-cipher';
import { SecondFactorMethodRegistry } from '../../totp/second-factor-method';
import { totpMethod } from '../../totp/totp-method';
import { TwoFactorVerificationService } from '../../two-factor-verification.service';
import type { FactorRow, TwoFactorPluginOptions } from '../../two-factor.types';

const FACTOR_UUID = '3f1c2a9e-0000-4000-8000-000000000001';

function serviceWithKey(key: Buffer): TwoFactorVerificationService {
    const options: TwoFactorPluginOptions = {
        required: true,
        encryptionKey: key,
        issuer: 'Site A',
    };
    return new TwoFactorVerificationService(
        {} as FactorStoreService,
        {} as AuthService,
        new SecondFactorMethodRegistry([totpMethod]),
        options,
    );
}

function factorEncryptedWith(key: Buffer): FactorRow {
    return {
        id: 1,
        uuid: FACTOR_UUID,
        userId: '1',
        method: 'totp',
        status: 'active',
        secretEncrypted: encryptSecret('JBSWY3DPEHPK3PXP', key, FACTOR_UUID),
        lastUsedStep: null,
        pendingExpiresAt: null,
        activatedAt: null,
    };
}

afterEach(() => vi.restoreAllMocks());

describe('matchStep with an unreadable secret', () => {
    it('answers a wrong code and logs an error with the factor uuid, never the secret', () => {
        const error = vi.spyOn(Logger, 'error').mockImplementation(() => undefined);
        const factor = factorEncryptedWith(randomBytes(32));
        const service = serviceWithKey(randomBytes(32));

        expect(service.matchStep(factor, '123456')).toBeNull();
        expect(error).toHaveBeenCalledTimes(1);
        const message = String(error.mock.calls[0]?.[0]);
        expect(message).toContain(FACTOR_UUID);
        expect(message).not.toContain(factor.secretEncrypted);
        expect(message).not.toContain('JBSWY3DPEHPK3PXP');
    });
});
