import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { verifyApiKey } from 'shared';

@Injectable()
export class KafkaStatusApiKeyGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const req = context
            .switchToHttp()
            .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
        if (!verifyApiKey(req.headers, process.env.ERP_CALLBACK_API_KEY)) {
            throw new UnauthorizedException('Invalid or missing API key');
        }
        return true;
    }
}
