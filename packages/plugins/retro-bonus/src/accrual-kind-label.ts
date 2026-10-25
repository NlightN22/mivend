// Display-only hints for known values; any other ERP string is shown as is.
const ACCRUAL_KIND_LABEL: Record<string, string> = {
    ПоЗакупкам: 'By purchases',
    ПоПоступлениюДС: 'By cash receipt',
    ПоПоступлениюДССБК: 'By cash receipt (SBK)',
    ПоПродажам: 'By sales',
};

export function accrualKindLabel(accrualKind: string): string {
    return ACCRUAL_KIND_LABEL[accrualKind] ?? accrualKind;
}
