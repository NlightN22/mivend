import { Injectable, Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import { ErpUserService, UserEnrichmentService } from '@mivend/plugin-access-control';
import { ContactPointService } from '@mivend/plugin-counterparty';
import { parseContactInfos } from './contact-infos';
import { inboundApplied, inboundNoop } from './inbound-stream-handler';
import type { InboundOutcome, InboundStreamHandler } from './inbound-stream-handler';

const loggerCtx = 'IntegrationUserHandler';

// Never creates Administrator; links by email, then persists erpId so reprocessing is idempotent.
// contactInfos replace the ERP channels of the linked Administrator only. isActive/isDeleted only sync a linked Administrator, never ErpUser; role is intentionally unused.
@Injectable()
export class UserStreamHandler implements InboundStreamHandler {
    constructor(
        private readonly userEnrichmentService: UserEnrichmentService,
        private readonly contactPoints: ContactPointService,
        private readonly erpUsers: ErpUserService,
    ) {}

    async apply(
        ctx: RequestContext,
        entityId: string,
        payload: Record<string, unknown>,
    ): Promise<InboundOutcome> {
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
            positionErpId: positionId,
            fullName,
            isActive,
        });
        const contactInfos = parseContactInfos(payload.contactInfos);
        const failure = contactInfos
            ? await this.contactPoints.guarded(ctx, `user ${entityId}`, async () => {
                  // Kept for an administrator that links later (AdministratorContactsListener).
                  await this.erpUsers.setContactInfos(ctx, entityId, JSON.stringify(contactInfos));
                  if (admin) {
                      await this.contactPoints.replaceErpPointsByErpId(
                          ctx,
                          'administrator',
                          entityId,
                          contactInfos,
                      );
                  }
              })
            : null;
        if (!admin) {
            return inboundNoop(
                `user ${entityId}: no linked Administrator (skipped)${failure ? `; ${failure}` : ''}`,
            );
        }
        Logger.verbose(`Enriched administrator erpId=${entityId}`, loggerCtx);
        return inboundApplied(undefined, failure);
    }
}
