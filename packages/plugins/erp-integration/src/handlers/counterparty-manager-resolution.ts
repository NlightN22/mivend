import { Logger } from '@nestjs/common';
import type { RequestContext } from '@vendure/core';
import type { UserEnrichmentService } from '@mivend/plugin-access-control';

const loggerCtx = 'IntegrationCounterpartyHandler';

export interface ManagerResolution {
    assignedManagerId: string | null | undefined;
    managerErpId: string | null | undefined;
    // The other managers the event lists that are linked to an Administrator, for the first-arrival team.
    teamAdministratorIds: string[];
    unresolvedReason?: string;
}

// Omitted manager keys must never clear an existing manager. A known but unlinked erpId
// is not a race: don't retry, save with assignedManagerId null; the listener backfills it.
export async function resolveManagers(
    users: UserEnrichmentService,
    entityId: string,
    ctx: RequestContext,
    payload: Record<string, unknown>,
): Promise<ManagerResolution> {
    const managerIds = Array.isArray(payload.managerIds) ? (payload.managerIds as unknown[]) : [];
    const managerErpId = payload.managerId
        ? String(payload.managerId)
        : managerIds.length > 0
          ? String(managerIds[0])
          : undefined;
    if (managerErpId === undefined) {
        return { assignedManagerId: undefined, managerErpId: undefined, teamAdministratorIds: [] };
    }

    const resolution = await users.findManagerLink(ctx, managerErpId);
    const team = await teamAdministrators(users, ctx, managerErpId, managerIds);
    if (!resolution.found) {
        // The manager is a soft reference: never hold the counterparty (or its waiting contracts)
        // for it; the id may never arrive, and assignedManagerId is backfilled on link.
        const reason = `counterparty ${entityId} saved without a manager: manager reference ${managerErpId} is not a known ERP user (it may be a user group, which is never published); assigned only if a user with this id links to an Administrator`;
        Logger.verbose(reason, loggerCtx);
        return {
            assignedManagerId: null,
            managerErpId,
            teamAdministratorIds: team,
            unresolvedReason: reason,
        };
    }
    if (resolution.administratorId === null) {
        Logger.verbose(
            `counterparty ${entityId}: manager erpId=${managerErpId} is known but not yet linked to an Administrator — saving with no manager, not retrying`,
            loggerCtx,
        );
        return { assignedManagerId: null, managerErpId, teamAdministratorIds: team };
    }
    const assignedManagerId = String(resolution.administratorId);
    return {
        assignedManagerId,
        managerErpId,
        teamAdministratorIds: team.filter(id => id !== assignedManagerId),
    };
}

async function teamAdministrators(
    users: UserEnrichmentService,
    ctx: RequestContext,
    mainErpId: string,
    managerIds: readonly unknown[],
): Promise<string[]> {
    const ids: string[] = [];
    for (const erpId of managerIds.map(String)) {
        if (erpId === mainErpId) continue;
        const link = await users.findManagerLink(ctx, erpId);
        if (link.found && link.administratorId !== null) ids.push(String(link.administratorId));
    }
    return ids;
}
