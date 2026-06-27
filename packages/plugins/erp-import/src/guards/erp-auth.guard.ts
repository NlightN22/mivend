import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class ErpAuthGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest<Request>();
        const auth = req.headers['authorization'] ?? '';
        const token = process.env.ERP_IMPORT_TOKEN;
        if (!token) throw new UnauthorizedException('ERP_IMPORT_TOKEN not configured');
        const expected = `Bearer ${token}`;
        if (auth !== expected) throw new UnauthorizedException('Invalid ERP import token');
        return true;
    }
}
