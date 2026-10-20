import { BranchAssignmentService } from './branch-assignment.service';
import { createBranchAssignmentTask } from './branch-assignment.scheduled-task';
import { DepartmentBranchMappingService } from './department-branch-mapping.service';
import { DepartmentBranchResolver } from './department-branch.resolver';
import { DepartmentBranchMapping } from './entities/department-branch-mapping.entity';

// Registrations of the department -> branch feature (#65), spread into AccessControlPlugin.
export const departmentBranchBundle = {
    entities: [DepartmentBranchMapping],
    providers: [BranchAssignmentService, DepartmentBranchMappingService],
    resolvers: [DepartmentBranchResolver],
    scheduledTasks: () => [createBranchAssignmentTask()],
};
