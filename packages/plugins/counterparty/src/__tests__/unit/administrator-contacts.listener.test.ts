import { describe, expect, it, vi } from 'vitest';
import type { EventBus, RequestContext } from '@vendure/core';
import { AdministratorLinkedEvent } from '@mivend/plugin-access-control';

import { AdministratorContactsListener } from '../../administrator-contacts.listener';

const ctx = {} as RequestContext;
type Handler = { handle(e: AdministratorLinkedEvent): Promise<void> };

function make(contactInfos: string | null | undefined): {
    handler: Handler;
    replaceErpPoints: ReturnType<typeof vi.fn>;
} {
    const replaceErpPoints = vi.fn();
    const listener = new AdministratorContactsListener(
        { ofType: vi.fn() } as unknown as EventBus,
        {
            findByErpId: vi
                .fn()
                .mockResolvedValue(contactInfos === undefined ? null : { contactInfos }),
        } as never,
        { replaceErpPoints } as never,
    );
    return { handler: listener as unknown as Handler, replaceErpPoints };
}

describe('AdministratorContactsListener', () => {
    it('user event first, administrator linked after: the stored list is applied to the administrator', async () => {
        const { handler, replaceErpPoints } = make(
            JSON.stringify([{ type: 'phone', value: '+79120000001' }]),
        );
        await handler.handle(new AdministratorLinkedEvent(ctx, 'u-1', 5));
        expect(replaceErpPoints).toHaveBeenCalledWith(ctx, 'administrator', 5, [
            { type: 'phone', value: '+79120000001' },
        ]);
    });

    it('does nothing when no list was stored or the ERP user is unknown', async () => {
        for (const stored of [null, undefined]) {
            const { handler, replaceErpPoints } = make(stored);
            await handler.handle(new AdministratorLinkedEvent(ctx, 'u-1', 5));
            expect(replaceErpPoints).not.toHaveBeenCalled();
        }
    });
});
