import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { ctxQueryBounded } from 'shared';

import { buildManagerList } from './counterparty-managers';
import type { ManagerList } from './counterparty-managers';
import { Counterparty } from './entities/counterparty.entity';

const TEAM_CEILING = 200;
const CONTACT_CEILING = 500;

export interface SnapshotContactInfo {
    type: string;
    label: string | null;
    isPrimary: boolean;
    value: string;
}

export interface CounterpartySnapshot extends ManagerList {
    counterparty: Counterparty;
    contactInfos: SnapshotContactInfo[];
}

// Four separate reads under the outbound lock, not the portal writers' lock; a mid-read write converges via its own version event.
@Injectable()
export class CounterpartySnapshotService {
    constructor(private readonly connection: TransactionalConnection) {}

    async load(ctx: RequestContext, erpId: string): Promise<CounterpartySnapshot | null> {
        const counterparty = await this.connection
            .getRepository(ctx, Counterparty)
            .findOne({ where: { erpId } });
        if (!counterparty) return null;
        const team = await ctxQueryBounded<{ administratorId: string }>(
            this.connection,
            ctx,
            `SELECT "administratorId" FROM counterparty_team_member
              WHERE "counterpartyId" = $1 ORDER BY id ASC`,
            [String(counterparty.id)],
            TEAM_CEILING,
        );
        const administratorIds = [
            ...(counterparty.assignedManagerId ? [counterparty.assignedManagerId] : []),
            ...team.map(row => row.administratorId),
        ];
        const links = administratorIds.length
            ? await ctxQueryBounded<{ administratorId: string; erpId: string }>(
                  this.connection,
                  ctx,
                  `SELECT "administratorId", "erpId" FROM erp_user
                    WHERE "administratorId" = ANY($1::text[])`,
                  [administratorIds],
                  TEAM_CEILING,
              )
            : [];
        const managers = buildManagerList(
            counterparty.assignedManagerId,
            team.map(row => row.administratorId),
            new Map(links.map(link => [link.administratorId, link.erpId])),
        );
        const contactInfos = await ctxQueryBounded<SnapshotContactInfo>(
            this.connection,
            ctx,
            `SELECT cp.type, cp.label, l."isPrimary", cp.value
               FROM counterparty_contact_point l
               JOIN contact_point cp ON cp.id = l."contactPointId"
              WHERE l."counterpartyId" = $1 ORDER BY l.id ASC`,
            [counterparty.id],
            CONTACT_CEILING,
        );
        return { counterparty, contactInfos, ...managers };
    }
}
