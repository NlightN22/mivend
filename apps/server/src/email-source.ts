import {
    Administrator,
    Injector,
    RequestContext,
    TransactionalConnection,
    User,
} from '@vendure/core';
import { siteName } from './site-config';

type Env = Record<string, string | undefined>;

export const DASHBOARD_PORTAL_HEADER = 'x-mivend-portal';
const DASHBOARD_PORTAL_VALUE = 'dashboard';

export interface EmailSourceConfig {
    siteName: string;
    fromEmail: string;
    domains: { staff: string; customer: string; dashboard: string };
}

export interface EmailSource {
    domain: string;
    from: string;
    subjectPrefix: string;
}

function domainOf(env: Env, name: string): string {
    const value = env[name];
    if (!value) return '';
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error(`${name} must be an http(s) URL`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`${name} must be an http(s) URL`);
    }
    return url.host;
}

export function emailSourceConfigFromEnv(env: Env, fromEmail: string): EmailSourceConfig {
    return {
        siteName: siteName(env),
        fromEmail,
        domains: {
            staff: domainOf(env, 'MANAGER_PUBLIC_URL'),
            customer: domainOf(env, 'STOREFRONT_PUBLIC_URL'),
            dashboard: domainOf(env, 'DASHBOARD_PUBLIC_URL'),
        },
    };
}

// The dashboard shares the staff user type with the manager portal; only its own proxy sets this header.
function fromDashboard(ctx: RequestContext, staff: boolean): boolean {
    const header = ctx.req?.headers?.[DASHBOARD_PORTAL_HEADER];
    return staff && ctx.apiType === 'admin' && header === DASHBOARD_PORTAL_VALUE;
}

export function resolveEmailSource(
    config: EmailSourceConfig,
    ctx: RequestContext,
    staff: boolean,
): EmailSource {
    const domain = fromDashboard(ctx, staff)
        ? config.domains.dashboard
        : staff
          ? config.domains.staff
          : config.domains.customer;
    if (!domain)
        return { domain, from: `"${config.siteName}" <${config.fromEmail}>`, subjectPrefix: '' };
    return {
        domain,
        from: `"${config.siteName} (${domain})" <${config.fromEmail}>`,
        subjectPrefix: `[${domain}] `,
    };
}

export function isStaffUser(
    connection: TransactionalConnection,
    ctx: RequestContext,
    userId: number | string,
): Promise<boolean> {
    return connection.getRepository(ctx, Administrator).exists({ where: { user: { id: userId } } });
}

export async function loadEmailSource(
    config: EmailSourceConfig,
    injector: Injector,
    event: { ctx: RequestContext; user: User },
): Promise<EmailSource> {
    const staff = await isStaffUser(
        injector.get(TransactionalConnection),
        event.ctx,
        event.user.id,
    );
    return resolveEmailSource(config, event.ctx, staff);
}

export function sourceTemplateVars(source: EmailSource): Record<string, string> {
    return { sourceDomain: source.domain, sourceFrom: source.from };
}
