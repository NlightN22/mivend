import { afterEach, describe, expect, it, vi } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';

import { ErpCallbackApiKeyGuard } from '../../erp-callback-api-key.guard';

const PLACEHOLDER = 'dev-callback-key-change-me-0000';
const REAL = 'real-callback-key-0123456789';

const contextWith = (key: string): ExecutionContext =>
    ({
        switchToHttp: () => ({ getRequest: () => ({ headers: { 'x-api-key': key } }) }),
    }) as unknown as ExecutionContext;

afterEach(() => vi.unstubAllEnvs());

describe('ErpCallbackApiKeyGuard', () => {
    it('accepts the configured key', () => {
        vi.stubEnv('ERP_CALLBACK_API_KEY', REAL);
        expect(new ErpCallbackApiKeyGuard().canActivate(contextWith(REAL))).toBe(true);
    });

    it('accepts the dev placeholder outside production', () => {
        vi.stubEnv('NODE_ENV', 'development');
        vi.stubEnv('ERP_CALLBACK_API_KEY', PLACEHOLDER);
        expect(new ErpCallbackApiKeyGuard().canActivate(contextWith(PLACEHOLDER))).toBe(true);
    });

    it('refuses the dev placeholder in production even when it matches', () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('ERP_CALLBACK_API_KEY', PLACEHOLDER);
        expect(() => new ErpCallbackApiKeyGuard().canActivate(contextWith(PLACEHOLDER))).toThrow(
            UnauthorizedException,
        );
    });

    it('still accepts a real key in production', () => {
        vi.stubEnv('NODE_ENV', 'production');
        vi.stubEnv('ERP_CALLBACK_API_KEY', REAL);
        expect(new ErpCallbackApiKeyGuard().canActivate(contextWith(REAL))).toBe(true);
    });
});
