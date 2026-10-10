import { CategoryStreamHandler } from './handlers/category.handler';
import { PriceStreamHandler } from './handlers/price.handler';
import { PriceTypeStreamHandler } from './handlers/price-type.handler';
import { ProductStreamHandler } from './handlers/product.handler';
import { StockStreamHandler } from './handlers/stock.handler';
import { WarehouseStreamHandler } from './handlers/warehouse.handler';
import { OrganizationStreamHandler } from './handlers/organization.handler';
import { DepartmentStreamHandler } from './handlers/department.handler';
import { PositionStreamHandler } from './handlers/position.handler';
import { CounterpartyStreamHandler } from './handlers/counterparty.handler';
import { CounterpartyCreditBalanceStreamHandler } from './handlers/counterparty-credit-balance.handler';
import { StorageLocationStreamHandler } from './handlers/storage-location.handler';
import { UserStreamHandler } from './handlers/user.handler';
import { OrderRegistrationResultHandler } from './handlers/order-registration-result.handler';
import { OrderChangedStreamHandler } from './handlers/order-changed.handler';
import { PromoRuleStreamHandler } from './handlers/promo-rule.handler';
import { DiscountRuleStreamHandler } from './handlers/discount-rule.handler';
import { GrantedDiscountStreamHandler } from './handlers/granted-discount.handler';
import { RetroBonusRuleStreamHandler } from './handlers/retro-bonus-rule.handler';
import { GrantedRetroBonusStreamHandler } from './handlers/granted-retro-bonus.handler';
import { VatRateStreamHandler } from './handlers/vat-rate.handler';
import { PointOfSaleStreamHandler } from './handlers/point-of-sale.handler';
import { ContractStreamHandler } from './handlers/contract.handler';
import { UnitStreamHandler } from './handlers/unit.handler';
import { ManufacturerStreamHandler } from './handlers/manufacturer.handler';
import { RegionStreamHandler } from './handlers/region.handler';
import { LegalFormStreamHandler } from './handlers/legal-form.handler';
import { BankStreamHandler } from './handlers/bank.handler';
import { BankAccountStreamHandler } from './handlers/bank-account.handler';
import { ProductPhotoStreamHandler } from './handlers/product-photo.handler';

// One provider per inbound stream; IntegrationInboxProcessorService maps stream -> handler.
export const STREAM_HANDLERS = [
    CategoryStreamHandler,
    PriceStreamHandler,
    PriceTypeStreamHandler,
    ProductStreamHandler,
    StockStreamHandler,
    WarehouseStreamHandler,
    OrganizationStreamHandler,
    DepartmentStreamHandler,
    PositionStreamHandler,
    CounterpartyStreamHandler,
    CounterpartyCreditBalanceStreamHandler,
    StorageLocationStreamHandler,
    UserStreamHandler,
    OrderRegistrationResultHandler,
    OrderChangedStreamHandler,
    PromoRuleStreamHandler,
    DiscountRuleStreamHandler,
    GrantedDiscountStreamHandler,
    RetroBonusRuleStreamHandler,
    GrantedRetroBonusStreamHandler,
    VatRateStreamHandler,
    PointOfSaleStreamHandler,
    ContractStreamHandler,
    UnitStreamHandler,
    ManufacturerStreamHandler,
    RegionStreamHandler,
    LegalFormStreamHandler,
    BankStreamHandler,
    BankAccountStreamHandler,
    ProductPhotoStreamHandler,
];
