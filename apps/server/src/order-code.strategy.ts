import { Injector, OrderCodeStrategy, RequestContext } from '@vendure/core';
import { NumberingService } from '@mivend/plugin-numbering';

export class NumberingOrderCodeStrategy implements OrderCodeStrategy {
    private numberingService!: NumberingService;

    init(injector: Injector): void {
        this.numberingService = injector.get(NumberingService);
    }

    generate(ctx: RequestContext): Promise<string> {
        return this.numberingService.next(ctx, 'order');
    }
}
