import { afterEach, describe, expect, it, vi } from 'vitest';

const query = vi.fn();
const end = vi.fn();

vi.mock('../../db-client', () => ({
    createDbClient: () => ({ connect: vi.fn(), query, end }),
}));

import { carryOverOrderLineIdentity } from '../../order-line-identity-carryover';

describe('carryOverOrderLineIdentity in production', () => {
    afterEach(() => {
        vi.unstubAllEnvs();
        query.mockReset();
        end.mockReset();
    });

    it('fails startup when order_line_identity is missing', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        query.mockResolvedValue({ rows: [{ name: null }] });

        await expect(carryOverOrderLineIdentity()).rejects.toThrow(/migration:run/);
        expect(end).toHaveBeenCalled();
    });

    it('passes without touching data when the table exists', async () => {
        vi.stubEnv('NODE_ENV', 'production');
        query.mockResolvedValue({ rows: [{ name: 'order_line_identity' }] });

        await expect(carryOverOrderLineIdentity()).resolves.toBeUndefined();
        expect(query).toHaveBeenCalledTimes(1);
    });
});
