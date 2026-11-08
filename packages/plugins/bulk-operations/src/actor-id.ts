import { AdministratorService, ForbiddenError, RequestContext } from '@vendure/core';

export async function actorIdOf(
    administratorService: AdministratorService,
    ctx: RequestContext,
): Promise<string> {
    const admin = ctx.activeUserId
        ? await administratorService.findOneByUserId(ctx, ctx.activeUserId)
        : null;
    if (!admin) throw new ForbiddenError();
    return String(admin.id);
}
