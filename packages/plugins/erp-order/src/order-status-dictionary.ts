import type { OrderState } from '@vendure/core';

export type StatusFlag =
    | 'terminal'
    | 'customerVisible'
    | 'warehouseStarted'
    | 'shipped'
    | 'delivered'
    | 'cancelled'
    | 'initial'
    | 'submitted'
    | 'rejected'
    | 'reservationConfirmed'
    | 'externalDefault';

export interface OrderStatusEntry extends Record<StatusFlag, boolean> {
    code: string;
    name: string;
    description: string;
    rank: number;
    customerGroup: string;
    source: 'erp' | 'mivend';
}

// Read-only view of the status dictionary: business decisions ask for attributes, never for a code.
export class OrderStatusDictionary {
    private readonly byCode: ReadonlyMap<string, OrderStatusEntry>;

    constructor(readonly entries: readonly OrderStatusEntry[]) {
        this.byCode = new Map(entries.map(entry => [entry.code, entry]));
    }

    get(code: string | null | undefined): OrderStatusEntry | null {
        return code == null ? null : (this.byCode.get(code) ?? null);
    }

    has(code: string | null | undefined, flag: StatusFlag): boolean {
        return this.get(code)?.[flag] === true;
    }

    // The status carrying a pipeline role; a dictionary without it is a setup defect, not a case to skip.
    codeWith(flag: StatusFlag): string {
        const entry = this.entries.find(candidate => candidate[flag]);
        if (!entry) throw new Error(`order status dictionary has no status flagged '${flag}'`);
        return entry.code;
    }

    codesWith(flag: StatusFlag): string[] {
        return this.entries.filter(entry => entry[flag]).map(entry => entry.code);
    }

    codesInGroup(group: string): string[] {
        return this.entries.filter(entry => entry.customerGroup === group).map(entry => entry.code);
    }

    // Forward-only by rank; a cancelled order never moves. An unknown current status never blocks,
    // an unknown next one does.
    canAdvance(current: string | null | undefined, next: string): boolean {
        if (this.has(current, 'cancelled')) return false;
        const nextEntry = this.get(next);
        if (!nextEntry) return false;
        const currentEntry = this.get(current);
        return !currentEntry || nextEntry.rank > currentEntry.rank;
    }

    // External orders are created directly in the Vendure state matching the status, never transitioned.
    vendureState(code: string): OrderState {
        if (this.has(code, 'cancelled')) return 'Cancelled';
        if (this.has(code, 'delivered')) return 'Delivered';
        if (this.has(code, 'shipped')) return 'Shipped';
        return 'PaymentAuthorized';
    }
}
