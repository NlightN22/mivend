// Customer rule: shown only when the ERP says the document is reflected in accounting.
// Absent flags (a document type without the attribute) stay hidden, unlike settlement documents.
export function isReflectedInAccounting(accounting: unknown): boolean {
    if (typeof accounting !== 'object' || accounting === null) return false;
    return (accounting as Record<string, unknown>).reflectedInAccounting === true;
}
