import { Administrator, PasswordResetEvent, TransactionalConnection } from '@vendure/core';
import { EmailEventListener } from '@vendure/email-plugin';

export interface PasswordResetUrls {
    staff: string;
    customer: string;
}

export function createPasswordResetHandler(
    urls: PasswordResetUrls,
): EmailEventListener<'password-reset'> {
    return new EmailEventListener('password-reset')
        .on(PasswordResetEvent)
        .loadData(async ({ event, injector }) => {
            const isStaff = await injector
                .get(TransactionalConnection)
                .getRepository(event.ctx, Administrator)
                .exists({ where: { user: { id: event.user.id } } });
            return { passwordResetUrl: isStaff ? urls.staff : urls.customer };
        })
        .setRecipient(event => event.user.identifier)
        .setFrom('{{ fromAddress }}')
        .setSubject('Forgotten password reset')
        .setTemplateVars(event => ({
            passwordResetToken: event.user.getNativeAuthenticationMethod().passwordResetToken,
            passwordResetUrl: event.data.passwordResetUrl,
        }));
}
