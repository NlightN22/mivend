export function isNotRegisteredInErp(fields: {
    erpOrderId: string | null;
    erpRegistrationStatus: string | null;
}): boolean {
    return !fields.erpOrderId && !fields.erpRegistrationStatus;
}
