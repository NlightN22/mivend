<script setup lang="ts">
import { computed } from 'vue';
import MvButton from '../MvButton/MvButton.vue';
import { useUiLabels } from '../../utils/uiLabels';
import { canJumpTo, nextKey, previousKey, stepStates, type WizardStep } from './wizardModel';

// Steps header, content slot and Back/Next; the page decides when Next is allowed and why not.
const props = withDefaults(
    defineProps<{
        steps: WizardStep[];
        modelValue: string;
        nextDisabledReason?: string;
        nextLabel?: string;
        backLabel?: string;
        busy?: boolean;
        hideBack?: boolean;
        hideNext?: boolean;
    }>(),
    {
        nextDisabledReason: '',
        busy: false,
        hideBack: false,
        hideNext: false,
    },
);
const emit = defineEmits<{ 'update:modelValue': [key: string]; next: [key: string] }>();
const label = useUiLabels();
const back = computed(() => props.backLabel ?? label('back', 'Back'));
const nextText = computed(() => props.nextLabel ?? label('next', 'Next'));

const states = computed(() => stepStates(props.steps, props.modelValue));
const previous = computed(() => previousKey(props.steps, props.modelValue));
const next = computed(() => nextKey(props.steps, props.modelValue));

function jump(key: string): void {
    if (!props.busy && canJumpTo(props.steps, props.modelValue, key))
        emit('update:modelValue', key);
}
function goNext(): void {
    if (next.value && !props.nextDisabledReason && !props.busy) {
        emit('update:modelValue', next.value);
        emit('next', next.value);
    }
}
</script>

<template>
    <section class="mv-wizard">
        <ol class="mv-wizard__steps">
            <li
                v-for="(step, index) in steps"
                :key="step.key"
                class="mv-wizard__step"
                :class="`mv-wizard__step--${states[index]}`"
                :aria-current="states[index] === 'current' ? 'step' : undefined"
            >
                <button
                    type="button"
                    class="mv-wizard__step-button"
                    :disabled="states[index] !== 'done' || busy"
                    @click="jump(step.key)"
                >
                    <span class="mv-wizard__dot">{{
                        states[index] === 'done' ? '✓' : index + 1
                    }}</span>
                    <span class="mv-wizard__label">{{ step.label }}</span>
                </button>
            </li>
        </ol>

        <div class="mv-wizard__content">
            <slot :step="modelValue" />
        </div>

        <footer v-if="!hideBack || !hideNext" class="mv-wizard__footer">
            <MvButton
                v-if="!hideBack && previous"
                variant="ghost"
                :disabled="busy"
                @click="emit('update:modelValue', previous)"
            >
                {{ back }}
            </MvButton>
            <span v-if="nextDisabledReason && !hideNext" class="mv-wizard__reason" role="status">
                {{ nextDisabledReason }}
            </span>
            <MvButton
                v-if="!hideNext && next"
                class="mv-wizard__next"
                :disabled="Boolean(nextDisabledReason)"
                :loading="busy"
                @click="goNext"
            >
                {{ nextText }}
            </MvButton>
        </footer>
    </section>
</template>

<style scoped>
.mv-wizard {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
}

.mv-wizard__steps {
    display: flex;
    gap: 8px;
    list-style: none;
    margin: 0;
    padding: 0;
}

.mv-wizard__step {
    flex: 1;
    min-width: 0;
    border-bottom: 2px solid var(--el-border-color);
    padding-bottom: 8px;
}

.mv-wizard__step--current {
    border-bottom-color: var(--el-color-primary);
}

.mv-wizard__step--done {
    border-bottom-color: var(--el-color-primary);
}

.mv-wizard__step-button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--el-text-color-secondary);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    text-align: left;
    cursor: default;
}

.mv-wizard__step--done .mv-wizard__step-button {
    cursor: pointer;
    color: var(--el-text-color-primary);
}

.mv-wizard__step--current .mv-wizard__step-button {
    color: var(--el-text-color-primary);
}

.mv-wizard__dot {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid var(--el-border-color);
    background: var(--app-surface);
    font-size: 12px;
}

.mv-wizard__step--current .mv-wizard__dot {
    border-color: var(--el-color-primary);
}

.mv-wizard__step--done .mv-wizard__dot {
    border-color: var(--el-color-primary);
    background: var(--el-color-primary);
    color: var(--app-on-accent);
}

.mv-wizard__label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.mv-wizard__content {
    min-width: 0;
}

.mv-wizard__footer {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--el-border-color);
}

.mv-wizard__reason {
    margin-left: auto;
    color: var(--el-text-color-secondary);
    font-size: 13px;
    text-align: right;
}

.mv-wizard__next {
    margin-left: auto;
}

.mv-wizard__reason + .mv-wizard__next {
    margin-left: 0;
}

@media (max-width: 800px) {
    .mv-wizard__label {
        display: none;
    }

    .mv-wizard__step--current .mv-wizard__label {
        display: inline;
    }

    .mv-wizard__footer {
        flex-wrap: wrap;
    }

    .mv-wizard__reason {
        order: -1;
        flex-basis: 100%;
        margin-left: 0;
        text-align: left;
    }
}
</style>
