// Ghostwriter Content Script - InboxSDK Integration
import * as InboxSDK from '@inboxsdk/core';

// Wait for window.onload (critical for Gmail as of 2025)
window.addEventListener('load', function () {
    // Load InboxSDK with AppId
    InboxSDK.load(2, 'sdk_ghostwriter_c73a9a612c').then(function (sdk) {
        // Register compose view handler
        sdk.Compose.registerComposeViewHandler(composeViewHandler);
    }).catch(function (error) {
        console.error('Ghostwriter: Failed to load InboxSDK:', error);
    });
});

const composeViewState = new WeakMap();

function getComposeState(composeView) {
    let state = composeViewState.get(composeView);
    if (state) {
        return state;
    }

    state = { destroyed: Boolean(composeView?.destroyed) };
    composeViewState.set(composeView, state);

    if (typeof composeView.on === 'function') {
        composeView.on('destroy', () => {
            state.destroyed = true;
        });
    }

    return state;
}

function isComposeViewActive(composeView, state) {
    return !(state?.destroyed || composeView?.destroyed);
}

function safeGetBodyElement(composeView, state) {
    if (!isComposeViewActive(composeView, state)) {
        return null;
    }

    try {
        return composeView.getBodyElement();
    } catch (error) {
        return null;
    }
}

// Handle each compose view
function composeViewHandler(composeView) {
    getComposeState(composeView);
    // Add Ghostwrite button to compose footer (near Send button)
    composeView.addButton({
        title: "Ghostwrite",
        iconUrl: chrome.runtime.getURL('assets/icons/icon.png'),
        type: 'MODIFIER',  // Places button in footer near Send
        onClick: function (event) {
            handleGhostwrite(event.composeView);
        }
    });
}

// Main click handler with dual-mode logic
async function handleGhostwrite(composeView) {
    const state = getComposeState(composeView);

    // Prevent double-clicks while processing
    if (isProcessing) {
        return;
    }

    // Set loading state immediately
    setButtonLoading(true);

    try {
        // 1. Extract draft content
        const draft = composeView.getTextContent().trim();

        // 2. Extract thread context
        const context = extractThreadContext(composeView);

        // 3. Get user's selected tone from storage
        const { tone } = await chrome.storage.local.get(['tone']);
        const selectedTone = tone || 'Regular';

        // 4. Determine mode: Polish (has draft) vs Generate (empty draft)
        const mode = draft.length > 0 ? 'polish' : 'generate';

        console.log('Ghostwriter: LLM payload:', {
            draft,
            context,
            tone: selectedTone,
            mode
        });

        // 5. For generate mode, validate we have context
        if (mode === 'generate' && context.messages.length === 0) {
            alert('Cannot generate draft: No existing thread context found. Please write a draft first.');
            return;
        }

        // 6. Send to background service worker
        const response = await chrome.runtime.sendMessage({
            type: 'GHOSTWRITE_REQUEST',
            payload: {
                draft,
                context,
                tone: selectedTone,
                mode  // 'polish' or 'generate'
            }
        });

        // If compose view was closed while waiting, skip updates
        if (!isComposeViewActive(composeView, state)) {
            return;
        }

        // 7. Handle response
        if (response.success) {
            applyResponseToCompose(composeView, state, response);
        } else {
            alert(`Ghostwriter Error: ${response.error}`);
        }
    } catch (error) {
        console.error('Ghostwriter: Error:', error);
        alert(`Failed to ghostwrite: ${error.message}`);
    } finally {
        setButtonLoading(false);
    }
}

// Extract thread context from Gmail DOM
function extractThreadContext(composeView) {
    // Check if this is a reply
    const isReply = composeView.isReply();

    if (!isReply) {
        return { type: 'compose', messages: [] };
    }

    const seenBodies = new Set(); // Track unique message bodies to avoid duplicates
    const maxMessages = 10;
    // Gmail DOM structure:
    // - Each message in a thread is in a .gs container
    // - Expanded messages: .gs (without .gt) - has .a3s body with full content
    // - Collapsed messages: .gs.gt - has .iA.g6 span with preview snippet
    // - Sender is in span.gD with email and name attributes
    // - Quoted content (previous emails) wrapped in .gmail_quote, .gmail_quote_container,
    //   blockquote.gmail_quote, .gmail_attr, .HOEnZb, .h5 - these are filtered out

    // Find all message containers using .gs class
    const messageContainers = document.querySelectorAll('.gs');

    if (messageContainers.length === 0) {
        return { type: 'reply', messages: [] };
    }

    // Walk newest -> oldest, then reverse so output is chronological
    const orderedMessages = Array.from(messageContainers).reverse();
    const collected = [];

    orderedMessages.forEach((msg) => {
        if (collected.length >= maxMessages) return;

        try {
            const isCollapsed = msg.classList.contains('gt');

            let body = '';
            let sender = 'Unknown';

            // Extract sender - .gD has the sender name
            const senderElement = msg.querySelector('.gD[email], .gD');
            if (senderElement) {
                // Prefer the name attribute if available, otherwise use text content
                sender = senderElement.getAttribute('name') || senderElement.textContent.trim();
            }

            if (isCollapsed) {
                // Collapsed message: extract preview snippet from .iA.g6 span
                const snippetElement = msg.querySelector('.iA.g6 span, .iA span');
                if (snippetElement) {
                    body = snippetElement.textContent.trim();
                }
            } else {
                // Expanded message: extract full body from .a3s
                const bodyElement = msg.querySelector('.a3s.aiL, .a3s');
                if (bodyElement) {
                    // Clone the element to avoid modifying the actual DOM
                    const bodyClone = bodyElement.cloneNode(true);

                    // Remove quoted content (previous emails in thread) to avoid duplicates
                    // Gmail wraps quoted content in these elements:
                    // - .gmail_quote: main container for quoted replies
                    // - .gmail_quote_container: alternative container
                    // - blockquote.gmail_quote: blockquote-style quotes
                    // - .gmail_attr: "On [date], [sender] wrote:" attribution line
                    // - .HOEnZb: container for hidden/trimmed content
                    // - .h5: another container for quoted content
                    bodyClone.querySelectorAll(
                        '.gmail_quote, .gmail_quote_container, blockquote.gmail_quote, ' +
                        '.gmail_attr, .HOEnZb, .h5'
                    ).forEach(el => el.remove());

                    body = bodyClone.innerText.trim();
                }
            }

            if (!body || body.length === 0) {
                return;
            }

            // Deduplicate
            if (seenBodies.has(body)) {
                return;
            }

            seenBodies.add(body);
            collected.push({ sender, body });
        } catch (error) {
            // Ignore DOM extraction errors for individual messages
        }
    });

    return { type: 'reply', messages: collected.reverse() };
}

// Extract Gmail signature before content replacement
// Returns cloned signature element or null if not found
function extractSignature(bodyElement) {
    try {
        const signatureElement = bodyElement.querySelector('.gmail_signature');

        if (!signatureElement) {
            return null;
        }

        // Clone to preserve original DOM structure and all properties
        const signatureClone = signatureElement.cloneNode(true);
        return signatureClone;
    } catch (error) {
        return null;
    }
}

function applyResponseToCompose(composeView, state, response) {
    const bodyElement = safeGetBodyElement(composeView, state);
    const signatureElement = bodyElement ? extractSignature(bodyElement) : null;

    if (response.isNewEmail && response.subject && response.body) {
        composeView.setSubject(response.subject);
        composeView.setBodyHTML(response.body);
    } else {
        composeView.setBodyHTML(response.polishedText);
    }

    cleanBodyFormatting(composeView, signatureElement, state);
}

// Clean body formatting by replacing with plain text in Gmail's native div structure
// This strips all inline styles and unwanted formatting from AI-generated content
function cleanBodyFormatting(composeView, signatureElement, state) {
    try {
        const bodyElement = safeGetBodyElement(composeView, state);

        if (!bodyElement) {
            return;
        }

        // Extract pure text content (strips all HTML/styles)
        const plainText = bodyElement.innerText;

        // Rebuild using Gmail's native structure: each line in a <div>, empty lines as <div><br></div>
        bodyElement.innerHTML = plainText.split('\n').map(line =>
            line.trim() ? `<div>${line}</div>` : '<div><br></div>'
        ).join('');

        // Re-append signature if it was extracted
        if (signatureElement) {
            bodyElement.appendChild(signatureElement);
        }
    } catch (error) {
        // Ignore formatting cleanup errors
    }
}

// Track loading state (InboxSDK compose buttons don't support setEnabled)
let isProcessing = false;

// Set button loading state
function setButtonLoading(isLoading) {
    isProcessing = isLoading;
}
