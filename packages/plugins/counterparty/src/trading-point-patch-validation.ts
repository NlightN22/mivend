import {
    isValidAddress,
    isValidEmail,
    isValidPersonName,
    isValidWorkingHours,
    normalizePhone,
} from 'shared';
import type { TradingPointDetailsPatch } from './trading-point.service';

interface CurrentPoint {
    name: string;
    address: string;
    workingHours: string | null;
    contacts: Array<{ name: string; phone: string | null; email: string | null }>;
}

// Only values the staff member changed are checked, so ERP values that predate the rules still save.
export function tradingPointPatchError(
    patch: TradingPointDetailsPatch,
    current: CurrentPoint,
): string | null {
    if (patch.name !== undefined && !patch.name.trim()) return 'name is required';
    if (patch.address !== undefined && patch.address !== current.address) {
        if (!isValidAddress(patch.address))
            return 'address must include a street and a house number';
    }
    if (patch.workingHours && patch.workingHours !== current.workingHours) {
        if (!isValidWorkingHours(patch.workingHours)) return 'working hours are too long';
    }
    for (const contact of patch.contacts ?? []) {
        const known = current.contacts.find(c => c.name === contact.name);
        if (!contact.name.trim()) return 'contact name is required';
        if (contact.name !== known?.name && !isValidPersonName(contact.name))
            return 'contact name must be a full name';
        if (contact.phone && contact.phone !== known?.phone && !normalizePhone(contact.phone))
            return 'contact phone must be a full number with the country code';
        if (contact.email && contact.email !== known?.email && !isValidEmail(contact.email))
            return 'contact e-mail is not valid';
    }
    return null;
}
