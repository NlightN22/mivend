import { tr } from './lazyLabels';
import type { ActionMenuItem } from '@mivend/ui-kit';

export interface HeaderActionInputs {
    canConfirm: boolean;
    confirmable: boolean;
    reserved: boolean;
    canExtend: boolean;
    canSeeChecks: boolean;
    cancelVisible: boolean;
    canCut: boolean;
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
    if (mobile && confirm) menu.push({ key: 'confirm', label: tr('orderDetail.actions.confirmOrder') });
    if (i.canSeeChecks) menu.push({ key: 'recompute', label: tr('orderDetail.actions.recomputeChecks') });
    if (i.canCut) menu.push({ key: 'cut', label: tr('orderDetail.actions.cutLines') });
    menu.push({ key: 'proformas', label: tr('orderDetail.actions.proformas') });
    menu.push({ key: 'documents', label: tr('orderDetail.actions.documents') });
    if (i.reserved && i.canConfirm) menu.push({ key: 'release', label: tr('orderDetail.actions.releaseReservation') });
    if (i.reserved && i.canExtend) menu.push({ key: 'extend', label: tr('orderDetail.actions.extendReservation') });
    if (mobile && cancel) menu.push({ key: 'cancel', label: tr('orderDetail.actions.cancelOrder'), danger: true });
    return { confirm: confirm && !mobile, cancel: cancel && !mobile, menu };
}
