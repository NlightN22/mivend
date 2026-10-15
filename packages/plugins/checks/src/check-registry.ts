import { Injectable } from '@nestjs/common';

import type { CheckProvider, SubjectTypeDefinition } from './registry-types';
import { CONSEQUENCES, DEFAULT_CONSEQUENCE } from './types';

// Other plugins inject this and register from onModuleInit; no ordering between plugins is
// assumed, so each cross-reference is validated whenever both sides are known.
@Injectable()
export class CheckRegistry {
    private readonly subjectTypes = new Map<string, SubjectTypeDefinition>();
    private readonly providers = new Map<string, CheckProvider>();

    registerSubjectType<S>(definition: SubjectTypeDefinition<S>): void {
        if (this.subjectTypes.has(definition.type)) {
            throw new Error(`Subject type "${definition.type}" is already registered`);
        }
        if (definition.stages.length === 0) {
            throw new Error(`Subject type "${definition.type}" declares no stages`);
        }
        for (const consequence of definition.allowedConsequences) {
            if (!CONSEQUENCES.includes(consequence)) {
                throw new Error(`Unknown consequence "${consequence}" on "${definition.type}"`);
            }
        }
        const stored = definition as SubjectTypeDefinition;
        this.subjectTypes.set(definition.type, stored);
        for (const provider of this.providers.values()) {
            if (provider.subjectType === definition.type) {
                this.assertCompatible(provider, stored);
            }
        }
    }

    registerCheck<S>(provider: CheckProvider<S>): void {
        if (this.providers.has(provider.code)) {
            throw new Error(`Check "${provider.code}" is already registered`);
        }
        const stored = provider as CheckProvider;
        const subjectType = this.subjectTypes.get(provider.subjectType);
        if (subjectType) {
            this.assertCompatible(stored, subjectType);
        }
        this.providers.set(provider.code, stored);
    }

    getSubjectType(type: string): SubjectTypeDefinition {
        const definition = this.subjectTypes.get(type);
        if (!definition) {
            throw new Error(`Unknown subject type "${type}"`);
        }
        return definition;
    }

    getCheck(code: string): CheckProvider | undefined {
        return this.providers.get(code);
    }

    listChecks(subjectType?: string): CheckProvider[] {
        const all = [...this.providers.values()];
        return subjectType ? all.filter(p => p.subjectType === subjectType) : all;
    }

    listForStage(subjectType: string, stage: string): CheckProvider[] {
        this.assertStage(this.getSubjectType(subjectType), stage);
        return this.listChecks(subjectType).filter(p => p.stages.includes(stage));
    }

    assertStage(definition: SubjectTypeDefinition, stage: string): void {
        if (!definition.stages.includes(stage)) {
            throw new Error(
                `Stage "${stage}" is not defined for subject type "${definition.type}"`,
            );
        }
    }

    private assertCompatible(provider: CheckProvider, subjectType: SubjectTypeDefinition): void {
        for (const stage of provider.stages) {
            if (!subjectType.stages.includes(stage)) {
                throw new Error(
                    `Check "${provider.code}" uses stage "${stage}" unknown to "${subjectType.type}"`,
                );
            }
        }
        const fallback = provider.defaultConsequence ?? DEFAULT_CONSEQUENCE;
        if (!subjectType.allowedConsequences.includes(fallback)) {
            throw new Error(
                `Default consequence "${fallback}" of "${provider.code}" is not allowed for "${subjectType.type}"`,
            );
        }
    }
}
