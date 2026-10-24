import {
    Administrator,
    PasswordResetEvent,
    RequestContext,
    TransactionalConnection,
} from '@vendure/core';
import { EmailEventHandler, EmailEventListener, EventWithAsyncData } from '@vendure/email-plugin';

export interface PasswordResetUrls {
    staff: string;
    customer: string;
}

export function isStaffUser(
    connection: TransactionalConnection,
    ctx: RequestContext,
    userId: number | string,
): Promise<boolean> {
    return connection.getRepository(ctx, Administrator).exists({ where: { user: { id: userId } } });
}

export function createPasswordResetHandler(
    urls: PasswordResetUrls,
): EmailEventHandler<
    'password-reset',
    EventWithAsyncData<PasswordResetEvent, { passwordResetUrl: string }>
> {
    return new EmailEventListener('password-reset')
        .on(PasswordResetEvent)
        .loadData(async ({ event, injector }) => {
            const isStaff = await isStaffUser(
                injector.get(TransactionalConnection),
                event.ctx,
                event.user.id,
            );
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
