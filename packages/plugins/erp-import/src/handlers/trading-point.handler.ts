import { Injectable } from '@nestjs/common';
import { RequestContext } from '@vendure/core';
import { TradingPointService } from '@mivend/plugin-counterparty';
import type { TradingPointRecord } from '../types';

@Injectable()
export class TradingPointHandler {
    constructor(private readonly tradingPointService: TradingPointService) {}

    async upsert(ctx: RequestContext, record: TradingPointRecord): Promise<void> {
        await this.tradingPointService.upsert(ctx, {
            erpId: record.erpId,
            counterpartyErpId: record.counterpartyErpId,
            name: record.name,
            address: record.address,
            latitude: record.latitude ?? null,
            longitude: record.longitude ?? null,
            workingHours: record.workingHours ?? null,
            isActive: record.isActive,
            contacts: record.contactName
                ? [
                      {
                          name: record.contactName,
                          phone: record.contactPhone ?? null,
                          isPrimary: true,
                      },
                  ]
                : undefined,
        });
    }
}
