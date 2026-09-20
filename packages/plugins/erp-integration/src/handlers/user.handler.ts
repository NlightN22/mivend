import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { UserEnrichmentService } from '@mivend/plugin-access-control';

import type { InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationUserHandler';

// Applies Integration Service's `user` stream (UserChanged, 1C's "Пользователи",
// company.customers.events.v1.user-changed). Issue #109: enrichment-only, never creates an
// Administrator — matches an existing one by email on first sight of an erpId, then persists
// erpId for idempotent re-processing (see UserEnrichmentService.linkAndEnrich's own comment).
// Issue #119 extends this with fullName/isActive/isDeleted: fullName seeds the ErpUser
// candidate row's display name; isActive/isDeleted drive automatic deactivate/reactivate of an
// already-linked Administrator (UserEnrichmentService delegates to
// AdministratorActivationService.syncFromErp) — never used to create/keep an ErpUser row.
// role/positionId are deliberately still deferred (mivend #117's Position-entity design isn't
// finalized yet, even though search-platform's own PositionChanged stream/position_id field are
// already live).
@Injectable()
export class UserStreamHandler implements InboundStreamHandler {
    constructor(private readonly userEnrichmentService: UserEnrichmentService) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<void> {
        // These are real optional-scalar fields — `undefined` (key absent) means "leave
        // unchanged", `null`/empty is a real value 1C explicitly sent.
        const email = 'email' in payload ? ((payload.email as string | null) ?? null) : undefined;
        const departmentId =
            'departmentId' in payload
                ? ((payload.departmentId as string | null) ?? null)
                : undefined;
        const fullName =
            'fullName' in payload ? ((payload.fullName as string | null) ?? null) : undefined;
        // Absent isActive means false, not true — see types.ts's InboundStream comment (proto3
        // bool zero-value omission), same fold-in-isDeleted rule every sibling handler uses.
        const isActive = payload.isActive === true && payload.isDeleted !== true;

        const admin = await this.userEnrichmentService.linkAndEnrich(ctx, {
            erpId: entityId,
            email,
            departmentId,
            fullName,
            isActive,
        });
        if (!admin) {
            Logger.verbose(`user ${entityId}: no linked Administrator (skipped)`, loggerCtx);
            return;
        }
        Logger.verbose(`Enriched administrator erpId=${entityId}`, loggerCtx);
    }
}
