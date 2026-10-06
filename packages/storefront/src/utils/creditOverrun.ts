export interface CreditOverrun {
    creditLimit: number;
    creditBalance: number;
    orderTotal: number;
}

const PREFIX = 'credit-limit-exceeded: ';

export function parseCreditOverrun(message: string | null | undefined): CreditOverrun | undefined {
    if (!message?.startsWith(PREFIX)) return undefined;
    try {
        return JSON.parse(message.slice(PREFIX.length)) as CreditOverrun;
    } catch {
        return undefined;
    }
}
