import { VisibilityGrant } from './entities/visibility-grant.entity';
import { UnsortedAdministratorService } from './unsorted-administrator.service';
import { VisibilityGrantReader } from './visibility-grant-reader.service';

// Read side of the visibility grants (#123), spread into AccessControlPlugin.
export const visibilityGrantBundle = {
    entities: [VisibilityGrant],
    providers: [VisibilityGrantReader, UnsortedAdministratorService],
};
