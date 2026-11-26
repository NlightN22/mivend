import { Logger } from '@vendure/core';

// The stub accepts any card payment, so a production server never enables it, whatever the flag says.
export function onlineStubEnabled(): boolean {
    if (process.env.ONLINE_PAYMENT_STUB_ENABLED !== 'true') return false;
    if (process.env.NODE_ENV !== 'production') return true;
    Logger.error(
        'ONLINE_PAYMENT_STUB_ENABLED=true is refused when NODE_ENV=production',
        'OnlinePaymentPlugin',
    );
    return false;
}
