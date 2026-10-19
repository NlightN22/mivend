import { i18n } from '../i18n';
import { packsToBase, salesUnitOf, type SalesUnitVariant } from './useSalesUnit';

export interface QuantityVariant extends SalesUnitVariant {
    multiplicity?: number | null;
}

export interface UnitView {
    label: string;
    factor: number;
    step: number;
    multiplicity?: string;
    note?: string;
}

// Mirrors plugin-moq's requiredMultiple: the sales-unit pack in a packages-only branch, else the enforced multiplicity.
export function unitViewOf(
    variant: QuantityVariant | null | undefined,
    packagesOnly: boolean,
    multiplicityEnforced: boolean,
): UnitView {
    const unit = salesUnitOf(variant, packagesOnly);
    if (unit) {
        return {
            label: unit.name,
            factor: unit.ratio,
            step: unit.packStep,
            multiplicity: unit.packStep > 1 ? `${unit.packStep} ${unit.name}` : '—',
            note: i18n.global.t('product.packNote', {
                unit: unit.name,
                pieces: packsToBase(1, unit),
            }),
        };
    }
    const multiple = multiplicityEnforced ? (variant?.multiplicity ?? 1) : 1;
    return { label: i18n.global.t('units.pc'), factor: 1, step: multiple > 1 ? multiple : 1 };
}

export function addQtyOf(
    variant: QuantityVariant | null | undefined,
    packagesOnly: boolean,
    multiplicityEnforced: boolean,
): number {
    const unit = salesUnitOf(variant, packagesOnly);
    const step = unitViewOf(variant, packagesOnly, multiplicityEnforced).step;
    return unit ? packsToBase(step, unit) : step;
}

// An explicit quantity (stepper, repeat order) is rounded up to the required multiple; none means one multiple.
export function resolveAddQty(
    variant: QuantityVariant | null | undefined,
    packagesOnly: boolean,
    multiplicityEnforced: boolean,
    requested?: number,
): number {
    const multiple = addQtyOf(variant, packagesOnly, multiplicityEnforced);
    if (requested === undefined) return multiple;
    return Math.max(1, Math.ceil(requested / multiple)) * multiple;
}
