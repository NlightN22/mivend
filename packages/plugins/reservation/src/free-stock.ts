// The single definition of one location's free quantity: ATP, the reserve check, the manager
// order-line column and failure details all use it (issue #72 ERP cap, floored at 0).
export function freeQuantity(
    stockOnHand: number,
    stockAllocated: number,
    activeReserved: number,
    erpAvailableQuantity: number | null | undefined,
): number {
    const local = stockOnHand - stockAllocated - activeReserved;
    const capped = erpAvailableQuantity != null ? Math.min(local, erpAvailableQuantity) : local;
    return Math.max(0, capped);
}
