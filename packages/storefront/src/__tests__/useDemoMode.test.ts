import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDemoMode } from '../composables/useDemoMode';

describe('useDemoMode', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('allows demo data outside a production build', () => {
        vi.stubEnv('PROD', false);
        expect(useDemoMode().demoAllowed).toBe(true);
    });

    it('hides demo data in a production build', () => {
        vi.stubEnv('PROD', true);
        expect(useDemoMode().demoAllowed).toBe(false);
    });
});
