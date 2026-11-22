import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';

import { TradingPoint } from './entities/trading-point.entity';
import { TradingPointErp } from './entities/trading-point-erp.entity';

export interface TradingPointContactFacts {
    address: string | null;
    contactPhone: string | null;
    contactInfos: string;
}

// Address, phone and channel list of a point of sale arrive from the contact-info stream, not from the point itself.
@Injectable()
export class TradingPointContactFactsService {
    constructor(private readonly connection: TransactionalConnection) {}

    // False when the point is not stored yet. The address only fills an empty one: mivend's record is the source of truth.
    async apply(
        ctx: RequestContext,
        erpId: string,
        facts: TradingPointContactFacts,
    ): Promise<boolean> {
        const mirrors = this.connection.getRepository(ctx, TradingPointErp);
        const mirror = await mirrors.findOne({ where: { erpId } });
        if (!mirror) return false;
        mirror.address = facts.address;
        mirror.contactPhone = facts.contactPhone;
        mirror.contactInfos = facts.contactInfos;
        await mirrors.save(mirror);
        if (facts.address) {
            await this.connection
                .getRepository(ctx, TradingPoint)
                .createQueryBuilder()
                .update()
                .set({ address: facts.address })
                .where(`"erpId" = :erpId AND COALESCE(address, '') = ''`, { erpId })
                .execute();
        }
        return true;
    }
}
