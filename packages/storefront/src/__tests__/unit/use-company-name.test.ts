import { describe, it, expect, vi } from 'vitest';
import { ref } from 'vue';

const counterparty = ref<{ fullName: string | null } | null>(null);
vi.mock('../../stores/auth', () => ({
    useAuthStore: () => ({ counterparty: counterparty.value }),
}));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => `t:${key}` }) }));

import { useCompanyName } from '../../pages/account/useCompanyName';

describe('useCompanyName', () => {
    it('shows fullName', () => {
        counterparty.value = { fullName: 'Customer Limited Liability Company' };
        const { companyName, initials } = useCompanyName();
        expect(companyName.value).toBe('Customer Limited Liability Company');
        expect(initials.value).toBe('CU');
    });

    it.each([null, '  '])('shows the neutral label when fullName is %j', fullName => {
        counterparty.value = { fullName };
        const { companyName, initials } = useCompanyName();
        expect(companyName.value).toBe('t:account.companyNameUnknown');
        expect(initials.value).toBe('?');
    });
});
