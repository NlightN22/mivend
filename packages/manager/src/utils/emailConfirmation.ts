export interface EmailConfirmationIndicator {
    address: string;
    sentAt: string | null;
}

export type ResendErrorKind = 'cooldown' | 'nothingPending' | 'generic';

export function emailConfirmationIndicator(
    pending: string | null,
    sentAt: string | null,
): EmailConfirmationIndicator | null {
    return pending ? { address: pending, sentAt } : null;
}

// Matches the server's UserInputError texts; anything else is shown as a generic failure.
export function resendErrorKind(message: string): ResendErrorKind {
    if (message.includes('less than 5 minutes')) return 'cooldown';
    if (message.includes('no e-mail address waiting')) return 'nothingPending';
    return 'generic';
}
