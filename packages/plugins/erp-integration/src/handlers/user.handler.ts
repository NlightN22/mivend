import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { UserEnrichmentService } from '@mivend/plugin-access-control';

import { inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationUserHandler';

// Applies Integration Service's `user` stream (UserChanged, the ERP's "Пользователи",
// company.customers.events.v1.user-changed). Issue #109: enrichment-only, never creates an
// Administrator — matches an existing one by email on first sight of an erpId, then persists
// erpId for idempotent re-processing (see UserEnrichmentService.linkAndEnrich's own comment).
// Issue #119 extends this with fullName/isActive/isDeleted: fullName seeds the ErpUser
// candidate row's display name; isActive/isDeleted drive automatic deactivate/reactivate of an
// already-linked Administrator (UserEnrichmentService delegates to
// AdministratorActivationService.syncFromErp) — never used to create/keep an ErpUser row.
// positionId is the Position.erpId (same Ref_Key as PositionChanged.entity_id), issue #117; `role`
// is deliberately still not consumed.
@Injectable()
export class UserStreamHandler implements InboundStreamHandler {
    constructor(private readonly userEnrichmentService: UserEnrichmentService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome | void> {
        // These are real optional-scalar fields — `undefined` (key absent) means "leave
        // unchanged", `null`/empty is a real value ERP explicitly sent.
        const email = 'email' in payload ? ((payload.email as string | null) ?? null) : undefined;
        const departmentId =
            'departmentId' in payload
                ? ((payload.departmentId as string | null) ?? null)
                : undefined;
        const positionId =
            'positionId' in payload ? ((payload.positionId as string | null) ?? null) : undefined;
        const fullName =
            'fullName' in payload ? ((payload.fullName as string | null) ?? null) : undefined;
        // Absent isActive means false, not true — see types.ts's InboundStream comment (proto3
        // bool zero-value omission), same fold-in-isDeleted rule every sibling handler uses.
        const isActive = payload.isActive === true && payload.isDeleted !== true;

        const admin = await this.userEnrichmentService.linkAndEnrich(ctx, {
            erpId: entityId,
            email,
            departmentId,
            positionId,
            fullName,
            isActive,
        });
        if (!admin) {
            return inboundNoop(`user ${entityId}: no linked Administrator (skipped)`);
        }
        Logger.verbose(`Enriched administrator erpId=${entityId}`, loggerCtx);
    }
}
