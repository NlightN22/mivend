import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { CounterpartyPlugin } from '@mivend/plugin-counterparty';
import { CrossReferencePlugin } from '@mivend/plugin-cross-reference';
import { PriceEntryPlugin } from '@mivend/plugin-price-entry';
import { DocumentsPlugin } from '@mivend/plugin-documents';
import { AccessControlPlugin } from '@mivend/plugin-access-control';
import { ErpOrderPlugin } from '@mivend/plugin-erp-order';
import { ErpIntegrationPlugin } from '@mivend/plugin-erp-integration';
import { ErpImportController } from './erp-import.controller';
import { CategoryHandler } from './handlers/category.handler';
import { CrossReferenceHandler } from './handlers/cross-reference.handler';
import { ErpImportService } from './erp-import.service';
import { ImportRunService } from './import-run.service';
import { ImportRun } from './entities/import-run.entity';
import { ImportRunError } from './entities/import-run-error.entity';
import { ErpAuthGuard } from './guards/erp-auth.guard';
import { ProductHandler } from './handlers/product.handler';
import { PriceHandler } from './handlers/price.handler';
import { StockHandler } from './handlers/stock.handler';
import { CustomerHandler } from './handlers/customer.handler';
import { CounterpartyHandler } from './handlers/counterparty.handler';
import { CustomerCounterpartyHandler } from './handlers/customer-counterparty.handler';
import { TradingPointHandler } from './handlers/trading-point.handler';
import { DiscountRuleHandler } from './handlers/discount-rule.handler';
import { DocumentHandler } from './handlers/document.handler';
import { OrganizationRequisitesHandler } from './handlers/organization-requisites.handler';
import { DepartmentHandler } from './handlers/department.handler';
import { PositionHandler } from './handlers/position.handler';
import { BranchHandler } from './handlers/branch.handler';
import { DepartmentBranchHandler } from './handlers/department-branch.handler';
import { EmployeeHandler } from './handlers/employee.handler';
import { WarehouseHandler } from './handlers/warehouse.handler';
import { StockOrganizationHandler } from './handlers/stock-organization.handler';
import { StorageLocationHandler } from './handlers/storage-location.handler';
import { ContractHandler } from './handlers/contract.handler';
import { OrderStatusHandler } from './handlers/order-status.handler';
import { ManufacturerHandler } from './handlers/manufacturer.handler';
import { SettlementHandler } from './handlers/settlement.handler';
import { SettlementPlugin } from '@mivend/plugin-settlement';

@VendurePlugin({
    imports: [
        PluginCommonModule,
        CounterpartyPlugin,
        CrossReferencePlugin,
        PriceEntryPlugin,
        DocumentsPlugin,
        AccessControlPlugin,
        ErpOrderPlugin,
        ErpIntegrationPlugin,
        SettlementPlugin,
    ],
    entities: [ImportRun, ImportRunError],
    controllers: [ErpImportController],
    providers: [
        ErpImportService,
        ImportRunService,
        ErpAuthGuard,
        ProductHandler,
        PriceHandler,
        StockHandler,
        CustomerHandler,
        CounterpartyHandler,
        CustomerCounterpartyHandler,
        TradingPointHandler,
        CategoryHandler,
        CrossReferenceHandler,
        DiscountRuleHandler,
        DocumentHandler,
        OrganizationRequisitesHandler,
        DepartmentHandler,
        PositionHandler,
        BranchHandler,
        DepartmentBranchHandler,
        EmployeeHandler,
        WarehouseHandler,
        ContractHandler,
        OrderStatusHandler,
        StockOrganizationHandler,
        StorageLocationHandler,
        ManufacturerHandler,
        SettlementHandler,
    ],
    compatibility: '>0.0.0',
})
export class ErpImportPlugin {}
