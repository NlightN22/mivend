import { PluginCommonModule, VendurePlugin } from '@vendure/core';
import { ErpImportController } from './erp-import.controller';
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

@VendurePlugin({
    imports: [PluginCommonModule],
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
    ],
    compatibility: '>0.0.0',
})
export class ErpImportPlugin {}
