// Ghostwriter Prompt Router
// Routes to tone-specific prompt modules

import * as RegularPrompts from './prompts/regular.js';
import * as BitcampPrompts from './prompts/bitcamp.js';

/**
 * Available tones and their corresponding prompt modules
 */
const PROMPT_MODULES = {
    'Regular': RegularPrompts,
    'Bitcamp': BitcampPrompts
};

/**
 * Build the complete system prompt for the specified tone
 * @param {string} tone - The email tone (Regular, Bitcamp)
 * @param {string} mode - The generation mode (polish, generate)
 * @param {string} contextType - The context type (reply, compose)
 * @returns {string} Complete system prompt
 */
export function buildSystemPrompt(tone, mode, contextType) {
    const promptModule = PROMPT_MODULES[tone] || PROMPT_MODULES['Regular'];
    return promptModule.buildSystemPrompt(mode, contextType);
}

/**
 * Build the user message with thread context
 * @param {string} tone - The email tone (Regular, Bitcamp)
 * @param {string} draft - The user's draft text
 * @param {Object} context - The email context (type, messages)
 * @param {string} mode - The generation mode
 * @returns {string} Formatted user message
 */
export function buildUserMessage(tone, draft, context, mode) {
    const promptModule = PROMPT_MODULES[tone] || PROMPT_MODULES['Regular'];
    return promptModule.buildUserMessage(draft, context, mode);
}
