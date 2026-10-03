import { Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { Logger, RequestContext, TransactionalConnection } from '@vendure/core';

import { Position } from './entities/position.entity';
import { loggerCtx } from './types';

export interface PositionRecordInput {
    erpId: string;
    name: string;
    parentErpId: string | null;
    isActive: boolean;
}

@Injectable()
export class PositionService {
    constructor(private connection: TransactionalConnection) {}

    async upsert(ctx: RequestContext, record: PositionRecordInput): Promise<Position> {
        const repo = this.connection.getRepository(ctx, Position);
        const existing = await repo.findOne({ where: { erpId: record.erpId } });
        const saved = await repo.save(
            existing ? Object.assign(existing, record) : repo.create(record),
        );
        Logger.verbose(`Upserted position erpId=${record.erpId}`, loggerCtx);
        return saved;
    }

    // Deletion tombstones carry no name — only flips isActive on a known row, never creates one.
    async setActiveStateIfExists(
        ctx: RequestContext,
        erpId: string,
        isActive: boolean,
    ): Promise<boolean> {
        const repo = this.connection.getRepository(ctx, Position);
        const position = await repo.findOne({ where: { erpId } });
        if (!position) return false;
        position.isActive = isActive;
        await repo.save(position);
        return true;
    }

    async findNamesByErpIds(ctx: RequestContext, erpIds: string[]): Promise<Map<string, string>> {
        if (erpIds.length === 0) return new Map();
        const rows = await this.connection
            .getRepository(ctx, Position)
            .find({ where: { erpId: In(erpIds) } });
        return new Map(rows.map(p => [p.erpId, p.name]));
    }
}
