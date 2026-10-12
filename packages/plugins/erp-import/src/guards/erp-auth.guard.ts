import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { productionRejectValues, verifyApiKey } from 'shared';

@Injectable()
export class ErpAuthGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<Request>();
        const rejectValues = productionRejectValues('dev-token');
        if (!verifyApiKey(req.headers, process.env.ERP_IMPORT_TOKEN, { rejectValues })) {
            throw new UnauthorizedException('Invalid or missing ERP import token');
        }
        return true;
    }
}
