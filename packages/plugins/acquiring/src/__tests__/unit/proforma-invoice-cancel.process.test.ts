import { describe, expect, it } from 'vitest';
import type { Injector, Order, RequestContext } from '@vendure/core';
import { TransactionalConnection, UserInputError } from '@vendure/core';

import { proformaInvoiceCancelProcess } from '../../proforma-invoice-cancel.process';
import { ProformaInvoiceWithdrawService } from '../../proforma-invoice-withdraw.service';

async function run(
    toState: string,
    openIds: number[],
    refuse = false,
): Promise<{ where: unknown[]; withdrawn: number[] }> {
    const seen = { where: [] as unknown[], withdrawn: [] as number[] };
    const connection = {
        getRepository: () => ({
            find: async (options: { where: unknown }) => {
                seen.where.push(options.where);
                return openIds.map(id => ({ id, number: `100-${id}` }));
            },
        }),
    };
    const withdraw = {
        withdraw: async (_ctx: RequestContext, id: number) => {
            if (refuse) throw new UserInputError('payment in progress');
            seen.withdrawn.push(id);
        },
    };
    proformaInvoiceCancelProcess.init?.({
        get: (token: unknown) =>
            token === TransactionalConnection
                ? connection
                : token === ProformaInvoiceWithdrawService
                  ? withdraw
                  : undefined,
    } as unknown as Injector);
    await proformaInvoiceCancelProcess.onTransitionEnd?.('PaymentSettled', toState as never, {
        ctx: {} as RequestContext,
        order: { id: '42', code: '1000042' } as unknown as Order,
    });
    return seen;
}

describe('proformaInvoiceCancelProcess', () => {
    it('withdraws every open current proforma of an order entering Cancelled', async () => {
        const seen = await run('Cancelled', [3, 5]);
        expect(seen.withdrawn).toEqual([3, 5]);
        expect(seen.where[0]).toMatchObject({ orderId: 42 });
    });

    it('does not look at proformas on any other transition', async () => {
        const seen = await run('PaymentSettled', [3]);
        expect(seen).toEqual({ where: [], withdrawn: [] });
    });

    it('refuses the whole cancel with the order and document named when a proforma cannot be withdrawn', async () => {
        await expect(run('Cancelled', [3], true)).rejects.toThrow(
            /Order 1000042 cannot be cancelled: proforma invoice 100-3/,
        );
    });
});
