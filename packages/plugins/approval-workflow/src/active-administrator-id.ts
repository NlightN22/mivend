import type { AdministratorService, RequestContext } from '@vendure/core';

export async function activeAdministratorId(
    administratorService: AdministratorService,
    ctx: RequestContext,
): Promise<string | null> {
    if (!ctx.activeUserId) return null;
    const admin = await administratorService.findOneByUserId(ctx, ctx.activeUserId);
    return admin ? String(admin.id) : null;
}
