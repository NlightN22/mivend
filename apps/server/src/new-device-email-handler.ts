import { NewDeviceSignInEvent } from '@mivend/plugin-session-management';
import { EmailEventListener } from '@vendure/email-plugin';
import { EMAIL_SUBJECTS } from './account-email-handlers';
import { EmailLanguage, resolveEmailLanguage } from './email-language';

export function createNewDeviceSignInHandler(fallback: EmailLanguage) {
    return new EmailEventListener('new-device-sign-in')
        .on(NewDeviceSignInEvent)
        .setRecipient(e => e.user.identifier)
        .setFrom('{{ fromAddress }}')
        .setSubject(e => EMAIL_SUBJECTS.newDeviceSignIn[resolveEmailLanguage(e.ctx, fallback)])
        .setTemplateVars(e => ({
            emailLanguage: resolveEmailLanguage(e.ctx, fallback),
            deviceLabel: e.deviceLabel,
            signedInAt: `${e.signedInAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
        }));
}
