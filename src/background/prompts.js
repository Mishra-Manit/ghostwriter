import * as RegularPrompts from './prompts/regular.js';
import * as BitcampPrompts from './prompts/bitcamp.js';

const PROMPT_MODULES = {
    'Regular': RegularPrompts,
    'Bitcamp': BitcampPrompts
};

export function buildSystemPrompt(tone, mode, contextType) {
    const promptModule = PROMPT_MODULES[tone] || PROMPT_MODULES['Regular'];
    return promptModule.buildSystemPrompt(mode, contextType);
}

export function buildUserMessage(tone, draft, context, mode) {
    const promptModule = PROMPT_MODULES[tone] || PROMPT_MODULES['Regular'];
    return promptModule.buildUserMessage(draft, context, mode);
}
