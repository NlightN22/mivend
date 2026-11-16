import { runGrantMissingDefaultPermissions } from './grant-default-role-permissions';
import { useUtcTimestamps } from './pg-utc';

useUtcTimestamps();

runGrantMissingDefaultPermissions().then(
    () => process.exit(0),
    error => {
        console.error(error);
        process.exit(1);
    },
);
