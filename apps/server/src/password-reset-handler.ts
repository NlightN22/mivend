import { PasswordResetEvent, TransactionalConnection } from '@vendure/core';
import { EMAIL_SUBJECTS } from './account-email-handlers';
import { EmailLanguage, resolveEmailLanguage } from './email-language';
import {
    EmailSource,
    EmailSourceConfig,
    isStaffUser,
    resolveEmailSource,
    sourceTemplateVars,
} from './email-source';
import { EmailEventHandler, EmailEventListener, EventWithAsyncData } from '@vendure/email-plugin';

export interface PasswordResetUrls {
    staff: string;
    customer: string;
}

export function createPasswordResetHandler(
    urls: PasswordResetUrls,
    fallback: EmailLanguage,
    sources: EmailSourceConfig,
): EmailEventHandler<
    'password-reset',
    EventWithAsyncData<PasswordResetEvent, { passwordResetUrl: string; source: EmailSource }>
> {
    return new EmailEventListener('password-reset')
        .on(PasswordResetEvent)
        .loadData(async ({ event, injector }) => {
            const isStaff = await isStaffUser(
                injector.get(TransactionalConnection),
                event.ctx,
                event.user.id,
            );
            return {
                passwordResetUrl: isStaff ? urls.staff : urls.customer,
                source: resolveEmailSource(sources, event.ctx, isStaff),
            };
        })
        .setRecipient(event => event.user.identifier)
        .setFrom('{{ sourceFrom }}')
        .setSubject(
            event =>
                event.data.source.subjectPrefix +
                EMAIL_SUBJECTS.passwordReset[resolveEmailLanguage(event.ctx, fallback)],
        )
        .setTemplateVars(event => ({
            ...sourceTemplateVars(event.data.source),
            emailLanguage: resolveEmailLanguage(event.ctx, fallback),
            passwordResetToken: event.user.getNativeAuthenticationMethod().passwordResetToken,
            passwordResetUrl: event.data.passwordResetUrl,
        }));
}
