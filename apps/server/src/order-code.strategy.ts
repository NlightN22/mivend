import { randomBytes } from 'crypto';
import { OrderCodeStrategy } from '@vendure/core';

export class DateStampedOrderCodeStrategy implements OrderCodeStrategy {
    generate(): string {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        // No DB read/write here on purpose — a MAX+1 query races under concurrent
        // order creation (two orders can read the same "next" number before either
        // commits). Year+month gives quick human orientation; the random suffix only
        // needs to be practically collision-free, not strictly sequential.
        const suffix = randomBytes(4).toString('hex').toUpperCase();
        return `ORD-${year}${month}-${suffix}`;
    }
}
