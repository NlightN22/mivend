import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RequestContext, TransactionalConnection, UserInputError } from '@vendure/core';

import { TradingPoint } from '../../entities/trading-point.entity';
import { TradingPointChange } from '../../entities/trading-point-change.entity';
import { TradingPointChangeAcceptedEvent } from '../../trading-point-change.events';
import { TradingPointChangeService } from '../../trading-point-change.service';

const payload = {
    name: 'Renamed',
    address: 'Main street 12, office 3',
    latitude: 7,
    longitude: 8,
    workingHours: '9-18',
    contactName: 'Ivan',
    contactPhone: '+79991234566',
};

const changeRepo = { findOne: vi.fn(), save: vi.fn(async (c: unknown) => c), find: vi.fn() };
const pointRepo = { findOne: vi.fn() };
const rawQuery = vi.fn();
const connection = {
    getRepository: vi.fn((_ctx: unknown, entity: unknown) => {
        if (entity === TradingPointChange) return changeRepo;
        if (entity === TradingPoint) return pointRepo;
        return { query: rawQuery };
    }),
};
const updateDetails = vi.fn();
const findOneVisible = vi.fn();
const publish = vi.fn();
const ctx = { activeUserId: 'u9' } as unknown as RequestContext;

describe('TradingPointChangeService', () => {
    let service: TradingPointChangeService;
    let change: TradingPointChange;

    beforeEach(() => {
        vi.clearAllMocks();
        change = {
            id: '5',
            uuid: 'change-uuid',
            tradingPointId: 'tp1',
            counterpartyId: 'cp1',
            payload: JSON.stringify(payload),
            status: 'pending',
        } as TradingPointChange;
        changeRepo.findOne.mockResolvedValue(change);
        pointRepo.findOne.mockResolvedValue({ id: 'tp1', uuid: 'point-uuid' });
        findOneVisible.mockResolvedValue({ id: 'cp1' });
        rawQuery.mockResolvedValue([{ v: 3 }]);
        service = new TradingPointChangeService(
            connection as unknown as TransactionalConnection,
            { updateDetails } as never,
            { findOneVisible } as never,
            { publish } as never,
        );
    });

    it('accept applies the proposal through the staff edit path and publishes it once with point uuid and version', async () => {
        const result = await service.accept(ctx, '5');

        expect(updateDetails).toHaveBeenCalledWith(
            ctx,
            'tp1',
            expect.objectContaining({
                name: 'Renamed',
                latitude: 7,
                longitude: 8,
                contacts: [{ name: 'Ivan', phone: '+79991234566', isPrimary: true }],
            }),
        );
        expect(result).toMatchObject({ status: 'accepted', version: 3, decidedByUserId: 'u9' });
        expect(publish).toHaveBeenCalledTimes(1);
        const event = publish.mock.calls[0][0] as TradingPointChangeAcceptedEvent;
        expect(event).toBeInstanceOf(TradingPointChangeAcceptedEvent);
        expect([event.tradingPointUuid, event.changeUuid, event.version]).toEqual([
            'point-uuid',
            'change-uuid',
            3,
        ]);
    });

    it('accept leaves the contacts alone when the proposal carried none', async () => {
        change.payload = JSON.stringify({ ...payload, contactName: undefined });

        await service.accept(ctx, '5');

        expect(updateDetails.mock.calls[0][2].contacts).toBeUndefined();
    });

    it('reject keeps the record untouched and publishes nothing', async () => {
        const result = await service.reject(ctx, '5', 'wrong address');

        expect(result).toMatchObject({ status: 'rejected', comment: 'wrong address' });
        expect(updateDetails).not.toHaveBeenCalled();
        expect(publish).not.toHaveBeenCalled();
    });

    it.each(['accepted', 'rejected'] as const)(
        'refuses to decide a %s change again',
        async status => {
            change.status = status;

            await expect(service.accept(ctx, '5')).rejects.toThrow(UserInputError);
            await expect(service.reject(ctx, '5')).rejects.toThrow(UserInputError);
            expect(updateDetails).not.toHaveBeenCalled();
            expect(publish).not.toHaveBeenCalled();
        },
    );

    it('answers an out-of-scope change like a missing one', async () => {
        findOneVisible.mockResolvedValue(null);

        await expect(service.accept(ctx, '5')).rejects.toThrow('not found');
        expect(updateDetails).not.toHaveBeenCalled();
    });

    it('lists only the pending changes of visible counterparties', async () => {
        changeRepo.find.mockResolvedValue([
            { id: '1', counterpartyId: 'cp1' },
            { id: '2', counterpartyId: 'cp2' },
        ]);
        findOneVisible.mockImplementation(async (_c: unknown, id: string) =>
            id === 'cp1' ? { id } : null,
        );

        const rows = await service.listPending(ctx);

        expect(rows.map(r => r.id)).toEqual(['1']);
    });
});
