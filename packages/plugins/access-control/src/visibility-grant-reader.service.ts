import { Injectable } from '@nestjs/common';
import { RequestContext, TransactionalConnection } from '@vendure/core';
import { Brackets } from 'typeorm';

import { VisibilityGrant } from './entities/visibility-grant.entity';

// Read side of the grants, used by the scope resolver; the write side lives with the audit log.
@Injectable()
export class VisibilityGrantReader {
    constructor(private connection: TransactionalConnection) {}

    // Not revoked, started and not yet ended: validTo is exclusive, null bounds are open.
    async activeManagerIds(
        ctx: RequestContext,
        granteeAdministratorId: string,
        now: Date = new Date(),
    ): Promise<string[]> {
        const rows = await this.connection
            .getRepository(ctx, VisibilityGrant)
            .createQueryBuilder('g')
            .select('DISTINCT g.subjectRef', 'subjectRef')
            .where('g.granteeAdministratorId = :grantee', { grantee: granteeAdministratorId })
            .andWhere("g.subjectKind = 'manager'")
            .andWhere('g.revokedAt IS NULL')
            .andWhere(
                new Brackets(qb =>
                    qb.where('g.validFrom IS NULL').orWhere('g.validFrom <= :now', { now }),
                ),
            )
            .andWhere(
                new Brackets(qb =>
                    qb.where('g.validTo IS NULL').orWhere('g.validTo > :now', { now }),
                ),
            )
            .getRawMany<{ subjectRef: string }>();
        return rows.map(row => row.subjectRef);
    }
}
