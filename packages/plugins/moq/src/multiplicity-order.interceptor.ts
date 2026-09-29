import {
    EntityHydrator,
    Injector,
    Order,
    OrderInterceptor,
    ProductVariant,
    RequestContext,
    TranslatorService,
    WillAddItemToOrderInput,
    WillAdjustOrderLineInput,
} from '@vendure/core';
import { BranchSettingsService } from '@mivend/plugin-access-control';

// Server-side pack-size (MOQ) enforcement — see docs/order-flow.md "Pack-size / MOQ".
// Covers addItemToOrder/adjustOrderLine/removeItemFromOrder (shop API) and the OrderService
// methods the admin draft-order flow calls, via Vendure's own OrderInterceptor extension point
// (its docs use exactly this "min/max order quantity via a ProductVariant custom field"
// use-case as the canonical example) — no per-mutation-site plumbing needed.
//
// Issue #103: also enforces branch-conditional packaging — when a variant's unitRatioToBase is
// set (a non-base default sales unit, resolved by erp-integration's ProductStreamHandler) AND
// BranchSettings.allowPiecewiseSale is false for the order's branch, unitRatioToBase becomes the
// effective required multiple instead of the plain `multiplicity` field, reusing the exact same
// "quantity % effective === 0" check/error shape — never a parallel mechanism. When
// allowPiecewiseSale is true (or no BranchSettings row resolves at all — see
// BranchSettingsService.resolveEffective's own global-default-branch fallback), no packaging
// constraint applies regardless of unitRatioToBase, and plain `multiplicity` enforcement is
// unchanged.
export class MultiplicityOrderInterceptor implements OrderInterceptor {
    private entityHydrator!: EntityHydrator;
    private translatorService!: TranslatorService;
    private branchSettingsService!: BranchSettingsService;

    init(injector: Injector): void {
        this.entityHydrator = injector.get(EntityHydrator);
        this.translatorService = injector.get(TranslatorService);
        this.branchSettingsService = injector.get(BranchSettingsService);
    }

    async willAddItemToOrder(
        ctx: RequestContext,
        order: Order,
        input: WillAddItemToOrderInput,
    ): Promise<void | string> {
        return this.checkMultiplicity(ctx, order, input.productVariant, input.quantity);
    }

    async willAdjustOrderLine(
        ctx: RequestContext,
        order: Order,
        input: WillAdjustOrderLineInput,
    ): Promise<void | string> {
        return this.checkMultiplicity(ctx, order, input.orderLine.productVariant, input.quantity);
    }

    // Normalizes per docs/order-flow.md's decided rule: null/0/negative multiplicity is a data
    // error, treated as "no constraint" (same as 1), not a rejection — don't block orders over
    // bad ERP data. Same normalization applies to the branch-conditional packaging multiple.
    private async checkMultiplicity(
        ctx: RequestContext,
        order: Order,
        variant: ProductVariant,
        quantity: number,
    ): Promise<void | string> {
        const multiplicity = variant.customFields?.multiplicity ?? 1;
        let effective = multiplicity > 1 ? multiplicity : 1;

        const unitRatioToBase = variant.customFields?.unitRatioToBase ?? null;
        if (unitRatioToBase && unitRatioToBase > 1) {
            const branchId = order.customFields?.branchId ?? null;
            const branchSettings = await this.branchSettingsService.resolveEffective(ctx, branchId);
            if (branchSettings && branchSettings.allowPiecewiseSale === false) {
                effective = unitRatioToBase;
            }
        }

        if (quantity % effective === 0) {
            return;
        }

        const variantName = await this.getTranslatedVariantName(ctx, variant);
        return `"${variantName}" must be ordered in multiples of ${effective}`;
    }

    private async getTranslatedVariantName(
        ctx: RequestContext,
        variant: ProductVariant,
    ): Promise<string> {
        await this.entityHydrator.hydrate(ctx, variant, { relations: ['translations'] });
        const translated = this.translatorService.translate(variant, ctx);
        return translated.name;
    }
}
