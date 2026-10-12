import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { verifyApiKey } from 'shared';

@Injectable()
export class ErpCallbackApiKeyGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<Request>();
        if (!verifyApiKey(req.headers, process.env.ERP_CALLBACK_API_KEY)) {
            throw new UnauthorizedException('Invalid or missing API key');
        }
        return true;
    }
}
