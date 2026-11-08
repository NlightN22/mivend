import type { ActionMenuItem } from '@mivend/ui-kit';

export interface HeaderActionInputs {
    canConfirm: boolean;
    confirmable: boolean;
    reserved: boolean;
    canExtend: boolean;
    canSeeChecks: boolean;
    cancelVisible: boolean;
}

export interface HeaderActions {
    confirm: boolean;
    cancel: boolean;
    menu: ActionMenuItem[];
}

// Same gates as the former panels: confirm only before a reservation exists; release and extend only after.
export function headerActions(i: HeaderActionInputs, mobile: boolean): HeaderActions {
    const confirm = i.canConfirm && i.confirmable && !i.reserved;
    const cancel = i.cancelVisible;
    const menu: ActionMenuItem[] = [];
    if (mobile && confirm) menu.push({ key: 'confirm', label: 'Confirm order' });
    if (i.canSeeChecks) menu.push({ key: 'recompute', label: 'Recompute checks' });
    menu.push({ key: 'proformas', label: 'Proforma invoices' });
    menu.push({ key: 'documents', label: 'Documents' });
    if (i.reserved && i.canConfirm) menu.push({ key: 'release', label: 'Release reservation' });
    if (i.reserved && i.canExtend) menu.push({ key: 'extend', label: 'Extend reservation' });
    if (mobile && cancel) menu.push({ key: 'cancel', label: 'Cancel order', danger: true });
    return { confirm: confirm && !mobile, cancel: cancel && !mobile, menu };
}
