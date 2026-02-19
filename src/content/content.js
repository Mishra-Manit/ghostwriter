import * as InboxSDK from '@inboxsdk/core';
import { extractThreadContext, extractFullThreadForCopy, formatThreadAsMarkdown } from './gmail-dom.js';
import { getComposeState, isComposeViewActive, applyResponseToCompose } from './compose-formatter.js';

window.addEventListener('load', function () {
    InboxSDK.load(2, 'sdk_ghostwriter_c73a9a612c').then(function (sdk) {
        sdk.Compose.registerComposeViewHandler(composeViewHandler);

        sdk.Toolbars.registerThreadButton({
            title: 'Copy Thread',
            iconUrl: chrome.runtime.getURL('assets/icons/icon.png'),
            onClick: function (event) {
                copyThreadToClipboard();
            },
        });
    }).catch(function (error) {
        console.error('Ghostwriter: Failed to load InboxSDK:', error);
    });
});

function composeViewHandler(composeView) {
    getComposeState(composeView);
    composeView.addButton({
        title: "Ghostwrite",
        iconUrl: chrome.runtime.getURL('assets/icons/icon.png'),
        type: 'MODIFIER',
        onClick: function (event) {
            handleGhostwrite(event.composeView);
        }
    });
}

async function handleGhostwrite(composeView) {
    const state = getComposeState(composeView);

    if (state.isProcessing) {
        return;
    }

    state.isProcessing = true;

    try {
        const draft = composeView.getTextContent().trim();
        const context = extractThreadContext(composeView);
        const { tone } = await chrome.storage.local.get(['tone']);
        const selectedTone = tone || 'Regular';
        const mode = draft.length > 0 ? 'polish' : 'generate';
        if (mode === 'generate' && context.messages.length === 0) {
            alert('Cannot generate draft: No existing thread context found. Please write a draft first.');
            return;
        }

        const response = await chrome.runtime.sendMessage({
            type: 'GHOSTWRITE_REQUEST',
            payload: {
                draft,
                context,
                tone: selectedTone,
                mode
            }
        });

        if (!isComposeViewActive(composeView, state)) {
            return;
        }

        if (response.success) {
            applyResponseToCompose(composeView, state, response);
        } else {
            alert(`Ghostwriter Error: ${response.error}`);
        }
    } catch (error) {
        console.error('Ghostwriter: Error:', error);
        alert(`Failed to ghostwrite: ${error.message}`);
    } finally {
        state.isProcessing = false;
    }
}

async function copyThreadToClipboard() {
    try {
        const { subject, messages } = extractFullThreadForCopy();
        if (messages.length === 0) return;

        const markdown = formatThreadAsMarkdown(subject, messages);
        await navigator.clipboard.writeText(markdown);
    } catch (error) {
        console.error('Ghostwriter: Copy failed:', error);
    }
}
