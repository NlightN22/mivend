import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/client', () => ({ adminApi: vi.fn() }));

import { adminApi } from '../../api/client';
import { fetchCreditLimitExceededCounterpartyIds } from '../../api/customers';

describe('fetchCreditLimitExceededCounterpartyIds', () => {
    beforeEach(() => {
        vi.mocked(adminApi).mockReset();
    });

    it('returns the flagged counterparty ids', async () => {
        vi.mocked(adminApi).mockResolvedValue({
            creditLimitExceededCounterpartyIds: ['3', '4'],
        } as never);
        expect(await fetchCreditLimitExceededCounterpartyIds()).toEqual(['3', '4']);
    });

    it('degrades to an empty list when the caller may not read orders', async () => {
        vi.mocked(adminApi).mockImplementation(async () => {
            throw new Error('FORBIDDEN');
        });
        expect(await fetchCreditLimitExceededCounterpartyIds()).toEqual([]);
    });
});
