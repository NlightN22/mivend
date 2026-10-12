import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { verifyApiKey } from 'shared';

@Injectable()
export class ErpAuthGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<Request>();
        const rejectValues = process.env.NODE_ENV === 'production' ? ['dev-token'] : [];
        if (!verifyApiKey(req.headers, process.env.ERP_IMPORT_TOKEN, { rejectValues })) {
            throw new UnauthorizedException('Invalid or missing ERP import token');
        }
        return true;
    }
}
