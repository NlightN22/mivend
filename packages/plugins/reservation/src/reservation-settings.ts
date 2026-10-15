import { Inject, Injectable } from '@nestjs/common';

import {
    DEFAULT_REJECTED_ORDER_RELEASE_DAYS,
    DEFAULT_RESERVATION_DAYS,
    RESERVATION_PLUGIN_OPTIONS,
} from './types';
import type { ReservationPluginOptions } from './types';

@Injectable()
export class ReservationSettings {
    constructor(@Inject(RESERVATION_PLUGIN_OPTIONS) private options: ReservationPluginOptions) {}

    defaultReservationDays(): number {
        return this.options.defaultReservationDays ?? DEFAULT_RESERVATION_DAYS;
    }

    rejectedOrderReleaseDays(): number {
        return this.options.rejectedOrderReleaseDays ?? DEFAULT_REJECTED_ORDER_RELEASE_DAYS;
    }
}
