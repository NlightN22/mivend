import { EmailPluginOptions } from '@vendure/email-plugin';
import { emailFooterText, siteName } from './site-config';

type Env = Record<string, string | undefined>;

const SMTP_REQUIRED = [
    'EMAIL_SMTP_HOST',
    'EMAIL_SMTP_PORT',
    'EMAIL_SMTP_SECURE',
    'EMAIL_SMTP_USER',
    'EMAIL_SMTP_PASSWORD',
    'EMAIL_FROM_ADDRESS',
] as const;

const SMTP_PRODUCTION_REQUIRED = [
    'MANAGER_PUBLIC_URL',
    'STOREFRONT_PUBLIC_URL',
    'SITE_NAME',
] as const;

export interface EmailTransportConfig {
    transport?: EmailPluginOptions['transport'];
    devMode?: true;
    outputPath?: string;
    route?: string;
    fromAddress: string;
}

function required(env: Env, name: string): string {
    const value = env[name];
    if (!value) {
        throw new Error(`${name} is required when EMAIL_TRANSPORT=smtp`);
    }
    return value;
}

function formatFrom(env: Env): string {
    return `"${siteName(env)}" <${required(env, 'EMAIL_FROM_ADDRESS')}>`;
}

export function emailGlobalTemplateVars(
    fromAddress: string,
    storefrontPublicUrl: string,
    env: Env,
): Record<string, string> {
    return {
        fromAddress,
        verifyEmailAddressUrl: `${storefrontPublicUrl}/verify`,
        siteName: siteName(env),
        footerText: emailFooterText(env),
    };
}

export function resolveEmailConfig(env: Env, outputPath: string): EmailTransportConfig {
    const production = env.NODE_ENV === 'production';
    const selected = env.EMAIL_TRANSPORT || (production ? undefined : 'file');
    if (!selected) {
        throw new Error(
            'EMAIL_TRANSPORT is required in production (smtp, or file for a contour that sends no mail)',
        );
    }
    if (selected === 'file') {
        const fromAddress = env.EMAIL_FROM_ADDRESS
            ? formatFrom(env)
            : `"${siteName(env)}" <noreply@localhost>`;
        return env.EMAIL_DEV_MAILBOX_ENABLED === 'true'
            ? { devMode: true, outputPath, route: 'mailbox', fromAddress }
            : { transport: { type: 'file', outputPath }, fromAddress };
    }
    if (selected !== 'smtp') {
        throw new Error(`EMAIL_TRANSPORT must be file or smtp, got ${selected}`);
    }
    for (const name of SMTP_REQUIRED) required(env, name);
    if (production) {
        for (const name of SMTP_PRODUCTION_REQUIRED) {
            if (!env[name])
                throw new Error(`${name} is required in production when EMAIL_TRANSPORT=smtp`);
        }
    }
    const secure = env.EMAIL_SMTP_SECURE;
    if (secure !== 'starttls' && secure !== 'tls') {
        throw new Error('EMAIL_SMTP_SECURE must be starttls or tls');
    }
    const port = Number(env.EMAIL_SMTP_PORT);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
        throw new Error('EMAIL_SMTP_PORT must be an integer from 1 to 65535');
    }
    const password = required(env, 'EMAIL_SMTP_PASSWORD');
    if (production && password.startsWith('change-me')) {
        throw new Error('EMAIL_SMTP_PASSWORD is still the example placeholder');
    }
    return {
        transport: {
            type: 'smtp',
            host: required(env, 'EMAIL_SMTP_HOST'),
            port,
            secure: secure === 'tls',
            requireTLS: secure === 'starttls',
            auth: { user: required(env, 'EMAIL_SMTP_USER'), pass: password },
        },
        fromAddress: formatFrom(env),
    };
}
