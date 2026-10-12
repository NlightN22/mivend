import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ERP_CALLBACK_DEV_PLACEHOLDER_KEY, productionRejectValues, verifyApiKey } from 'shared';

@Injectable()
export class ErpCallbackApiKeyGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<Request>();
        const rejectValues = productionRejectValues(ERP_CALLBACK_DEV_PLACEHOLDER_KEY);
        if (!verifyApiKey(req.headers, process.env.ERP_CALLBACK_API_KEY, { rejectValues })) {
            throw new UnauthorizedException('Invalid or missing API key');
        }
        return true;
    }
}
