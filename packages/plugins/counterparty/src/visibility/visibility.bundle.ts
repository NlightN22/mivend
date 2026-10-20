import { UnsortedCounterpartyService } from './unsorted-counterparty.service';
import { VisibilityGrantQueryService } from './visibility-grant-query.service';
import { VisibilityGrantService } from './visibility-grant.service';
import { VisibilityResolver } from './visibility.resolver';

// Registrations of the visibility grants and the unsorted list (#123), spread into CounterpartyPlugin.
export const visibilityBundle = {
    providers: [VisibilityGrantService, VisibilityGrantQueryService, UnsortedCounterpartyService],
    resolvers: [VisibilityResolver],
};
