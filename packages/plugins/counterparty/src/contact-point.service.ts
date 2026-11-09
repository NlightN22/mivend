import { Injectable } from '@nestjs/common';
import { Administrator, RequestContext, TransactionalConnection } from '@vendure/core';
import type { FindOptionsWhere, ObjectType } from 'typeorm';
import { In } from 'typeorm';
import { withAggregateLock } from 'shared';

import { AdministratorContactPoint } from './entities/administrator-contact-point.entity';
import { OrganizationContactPoint } from './entities/organization-contact-point.entity';
import type { ContactPointLink } from './entities/contact-link.base';
import { ContactPersonContactPoint } from './entities/contact-person-contact-point.entity';
import { ContactPoint } from './entities/contact-point.entity';
import { Counterparty } from './entities/counterparty.entity';
import { TradingPoint } from './entities/trading-point.entity';
import { CounterpartyContactPoint } from './entities/counterparty-contact-point.entity';
import { TradingPointContactPoint } from './entities/trading-point-contact-point.entity';
import { resolveContactPoints } from './contact-point-normalize';
import type { ContactPointInput, ResolvedContactPoint } from './contact-point-normalize';
import { planContactPointReplace } from './contact-point-replace-plan';

type ErpOwnerKind = 'counterparty' | 'tradingPoint' | 'organization' | 'administrator';
export type ContactOwnerKind =
    | 'counterparty'
    | 'tradingPoint'
    | 'contactPerson'
    | 'administrator'
    | 'organization';

const LINKS: Record<ContactOwnerKind, { entity: ObjectType<ContactPointLink>; column: string }> = {
    counterparty: { entity: CounterpartyContactPoint, column: 'counterpartyId' },
    tradingPoint: { entity: TradingPointContactPoint, column: 'tradingPointId' },
    contactPerson: { entity: ContactPersonContactPoint, column: 'contactPersonId' },
    administrator: { entity: AdministratorContactPoint, column: 'administratorId' },
    organization: { entity: OrganizationContactPoint, column: 'organizationId' },
};

const OWNER_ENTITIES: Record<ErpOwnerKind, string | ObjectType<{ id: unknown }>> = {
    counterparty: Counterparty,
    tradingPoint: TradingPoint,
    organization: 'OrganizationRequisites',
    administrator: Administrator,
};

@Injectable()
export class ContactPointService {
    constructor(private readonly connection: TransactionalConnection) {}

    // Replaces the ERP-sourced channels of one owner as a set; manual channels are never touched.
    async replaceErpPoints(
        ctx: RequestContext,
        kind: ContactOwnerKind,
        ownerId: number,
        inputs: readonly ContactPointInput[],
    ): Promise<void> {
        const incoming = resolveContactPoints(inputs);
        await withAggregateLock(this.connection, ctx, `contact-points:${kind}:${ownerId}`, txCtx =>
            this.apply(txCtx, kind, ownerId, incoming),
        );
    }

    // Owners that come from the ERP are addressed by their ERP id; false when the owner is not stored.
    async replaceErpPointsByErpId(
        ctx: RequestContext,
        kind: ErpOwnerKind,
        erpId: string,
        inputs: readonly ContactPointInput[],
    ): Promise<boolean> {
        const owner = await this.connection.getRepository(ctx, OWNER_ENTITIES[kind]).findOne({
            where: (kind === 'administrator'
                ? { customFields: { erpId } }
                : { erpId }) as unknown as FindOptionsWhere<{ id: unknown }>,
            select: { id: true },
        });
        if (!owner) return false;
        await this.replaceErpPoints(ctx, kind, owner.id as number, inputs);
        return true;
    }

    private async apply(
        ctx: RequestContext,
        kind: ContactOwnerKind,
        ownerId: number,
        incoming: readonly ResolvedContactPoint[],
    ): Promise<void> {
        const { entity, column } = LINKS[kind];
        const links = this.connection.getRepository(ctx, entity);
        const points = this.connection.getRepository(ctx, ContactPoint);
        const owned = await links.find({
            where: { [column]: ownerId } as unknown as FindOptionsWhere<ContactPointLink>,
            relations: { contactPoint: true },
        });
        const plan = planContactPointReplace(
            owned.map(l => ({ ...l.contactPoint, id: l.contactPoint.id as number })),
            incoming,
        );

        for (const { id, point } of plan.update) await points.update(id, erpFields(point));
        for (const point of plan.insert) {
            const saved = await points.save(points.create(erpFields(point)));
            await links.save(
                links.create({
                    contactPointId: saved.id as number,
                    isPrimary: point.isPrimary,
                    [column]: ownerId,
                } as never),
            );
        }
        if (plan.deleteIds.length > 0) await points.delete({ id: In(plan.deleteIds) });
    }
}

function erpFields(point: ResolvedContactPoint): Partial<ContactPoint> {
    return {
        type: point.type,
        value: point.value,
        normalizedValue: point.normalizedValue,
        isUsable: point.isUsable,
        label: point.label,
        isPrimary: point.isPrimary,
        comment: point.comment,
        source: 'erp',
    };
}
