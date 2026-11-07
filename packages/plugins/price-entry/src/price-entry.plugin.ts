import {
    LanguageCode,
    PluginCommonModule,
    RuntimeVendureConfig,
    VendurePlugin,
} from '@vendure/core';
import { AccessControlPlugin } from '@mivend/plugin-access-control';
import { ApprovalWorkflowPlugin } from '@mivend/plugin-approval-workflow';
import { ChecksPlugin } from '@mivend/plugin-checks';
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';
import { ErpOrderPlugin } from '@mivend/plugin-erp-order';
import { NumberingPlugin } from '@mivend/plugin-numbering';
import { ReservationPlugin } from '@mivend/plugin-reservation';

import { ProductVariantPriceEntry } from './price-entry.entity';
import { DiscountRule } from './discount-rule.entity';
import {
    DiscountConditionKind,
    DiscountOperationKind,
    DiscountSetup,
    DiscountSetupProduct,
    DiscountSetupFilterTerm,
    DiscountSetupRecipient,
} from './discount-setup.entity';
import { DiscountGrant } from './discount-grant.entity';
import { DiscountRegistryEntry } from './discount-registry-entry.entity';
import { GrantedDiscount } from './granted-discount.entity';
import {
    DiscountRuleAdminResolver,
    OrderLineDiscountResolver,
    PriceEntryAdminResolver,
    ProductVariantPriceResolver,
} from './price-entry.resolver';
import { concatAST } from 'graphql';
import { adminApiSchema, shopApiSchema } from './price-entry.schema';
import { discountLimitSchema } from './discount-limit.schema';
import { DiscountLimit } from './discount-limit.entity';
import { DiscountLimitResolver } from './discount-limit.resolver';
import { DiscountLimitService } from './discount-limit.service';
import { LineDiscountService } from './line-discount.service';
import { OrderLineDiscountService } from './order-line-discount.service';
import { OrderDiscountLimitCheck } from './order-discount-limit.check';
import { PriceAdjustmentLimitCheck } from './price-adjustment-limit.check';
import { PriceAdjustmentResolver } from './price-adjustment.resolver';
import { DiscountGrantResolver } from './discount-grant.resolver';
import { DiscountRegistryResolver } from './discount-registry.resolver';
import { PriceEntryService } from './price-entry.service';
import { FloorPriceService } from './floor-price.service';
import { DiscountRuleService } from './discount-rule.service';
import { PromoDiscountRuleService } from './promo-discount-rule.service';
import { DiscountConditionKindBootstrapService } from './discount-condition-kind-bootstrap.service';
import { DiscountSetupRulesService } from './discount-setup-rules.service';
import { DiscountSetupReclassifyService } from './discount-setup-reclassify.service';
import { DiscountSetupService } from './discount-setup.service';
import { OrderLineContextService } from './order-line-context.service';
import { CatalogPricingService } from './catalog-pricing.service';
import { PriceResolutionService } from './price-resolution.service';
import { TierProgressService } from './tier-progress.service';
import { OrderDiscountService } from './order-discount.service';
import { OrderDiscountPromotionBootstrapService } from './order-discount-promotion-bootstrap.service';
import { orderDiscountAction, orderDiscountCondition } from './order-discount.promotion';
import { OrderFloorPriceCheck } from './order-floor-price.check';
import { PriceAdjustmentFloorCheck } from './price-adjustment-floor.check';
import { PriceAdjustmentService } from './price-adjustment.service';
import { PriceAdjustmentScopeRegistrar } from './price-adjustment-scope.registrar';
import { DiscountGrantService } from './discount-grant.service';
import { DiscountRegistryService } from './discount-registry.service';
import { GrantedDiscountService } from './granted-discount.service';

@VendurePlugin({
    imports: [
        PluginCommonModule,
        AccessControlPlugin,
        ApprovalWorkflowPlugin,
        ChecksPlugin,
        CounterpartyPlugin,
        ErpOrderPlugin,
        NumberingPlugin,
        ReservationPlugin,
    ],
    entities: [
        ProductVariantPriceEntry,
        DiscountRule,
        DiscountSetup,
        DiscountSetupRecipient,
        DiscountSetupProduct,
        DiscountSetupFilterTerm,
        DiscountConditionKind,
        DiscountOperationKind,
        DiscountGrant,
        DiscountRegistryEntry,
        GrantedDiscount,
        DiscountLimit,
    ],
    shopApiExtensions: {
        schema: shopApiSchema,
        resolvers: [ProductVariantPriceResolver, OrderLineDiscountResolver],
    },
    adminApiExtensions: {
        schema: concatAST([adminApiSchema, discountLimitSchema]),
        resolvers: [
            PriceEntryAdminResolver,
            DiscountRuleAdminResolver,
            PriceAdjustmentResolver,
            DiscountGrantResolver,
            DiscountRegistryResolver,
            DiscountLimitResolver,
        ],
    },
    providers: [
        PriceEntryService,
        FloorPriceService,
        DiscountRuleService,
        PromoDiscountRuleService,
        DiscountSetupService,
        DiscountSetupRulesService,
        DiscountConditionKindBootstrapService,
        DiscountSetupReclassifyService,
        PriceResolutionService,
        CatalogPricingService,
        OrderLineContextService,
        TierProgressService,
        OrderDiscountService,
        OrderDiscountPromotionBootstrapService,
        PriceAdjustmentFloorCheck,
        OrderFloorPriceCheck,
        PriceAdjustmentService,
        PriceAdjustmentScopeRegistrar,
        DiscountGrantService,
        DiscountRegistryService,
        GrantedDiscountService,
        DiscountLimitService,
        LineDiscountService,
        OrderLineDiscountService,
        OrderDiscountLimitCheck,
        PriceAdjustmentLimitCheck,
    ],
    exports: [
        PriceEntryService,
        DiscountRuleService,
        PromoDiscountRuleService,
        DiscountSetupService,
        GrantedDiscountService,
        PriceResolutionService,
        CatalogPricingService,
    ],
    configuration: (config: RuntimeVendureConfig) => {
        config.promotionOptions.promotionConditions = [
            ...(config.promotionOptions.promotionConditions ?? []),
            orderDiscountCondition,
        ];
        config.promotionOptions.promotionActions = [
            ...(config.promotionOptions.promotionActions ?? []),
            orderDiscountAction,
        ];
        config.customFields.OrderLine = [
            ...(config.customFields.OrderLine ?? []),
            {
                name: 'manualUnitPrice',
                type: 'int' as const,
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Manual unit price override' }],
                description: [
                    {
                        languageCode: LanguageCode.en,
                        value: 'Set by PriceAdjustmentService when a manager-adjusted price is applied — see CustomerPriceCalculationStrategy.',
                    },
                ],
            },
            {
                name: 'manualPriceReason',
                type: 'string' as const,
                public: false,
                nullable: true,
                label: [{ languageCode: LanguageCode.en, value: 'Manual price override reason' }],
            },
        ];
        return config;
    },
    compatibility: '>0.0.0',
})
export class PriceEntryPlugin {}
