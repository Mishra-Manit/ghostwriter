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

    state = { destroyed: Boolean(composeView.destroyed) };
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
        console.warn('Ghostwriter: Failed to read compose body element:', error);
        return null;
    }
}

// Handle each compose view
function composeViewHandler(composeView) {
    getComposeState(composeView);
    // Add Ghostwrite button to compose footer (near Send button)
    const button = composeView.addButton({
        title: "Ghostwrite",
        iconUrl: chrome.runtime.getURL('assets/icons/icon.png'),
        type: 'MODIFIER',  // Places button in footer near Send
        onClick: function (event) {
            handleGhostwrite(event.composeView, button);
        }
    });
}

// Main click handler with dual-mode logic
async function handleGhostwrite(composeView, button) {
    const state = getComposeState(composeView);

    // Prevent double-clicks while processing
    if (isProcessing) {
        return;
    }

    // Set loading state immediately
    setButtonLoading(button, true);

    try {
        // 1. Extract draft content
        const draft = composeView.getTextContent().trim();

        // 2. Extract thread context
        const context = extractThreadContext(composeView);

        // Log context retrieved from email chain
        console.log('Ghostwriter: Email context retrieved:', {
            type: context.type,
            messages: context.messages.length,
            details: context.messages.map(m => ({ sender: m.sender, bodyLength: m.body.length }))
        });

        // 3. Get user's selected tone from storage
        const { tone, anthropicApiKey } = await chrome.storage.local.get(['tone', 'anthropicApiKey']);
        const selectedTone = tone || 'Regular';

        // Check if API key is configured
        if (!anthropicApiKey) {
            alert('Please configure your Anthropic API key by clicking the Ghostwriter extension icon.');
            return;
        }

        // 4. Determine mode: Polish (has draft) vs Generate (empty draft)
        const mode = draft.length > 0 ? 'polish' : 'generate';

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
            console.log('Ghostwriter: Compose view closed before response was applied');
            return;
        }

        // 7. Handle response
        if (response.success) {
            // Check if this is a new email with subject and body
            if (response.isNewEmail && response.subject && response.body) {
                // Set the subject line
                composeView.setSubject(response.subject);

                // Extract signature BEFORE replacing content
                const bodyElement = safeGetBodyElement(composeView, state);
                const signatureElement = bodyElement ? extractSignature(bodyElement) : null;

                // Use InboxSDK's setBodyHTML for initial insertion
                composeView.setBodyHTML(response.body);

                // Clean formatting and restore signature
                cleanBodyFormatting(composeView, signatureElement, state);
            } else {
                // Extract signature BEFORE replacing content
                const bodyElement = safeGetBodyElement(composeView, state);
                const signatureElement = bodyElement ? extractSignature(bodyElement) : null;

                // Reply or polish mode - use InboxSDK's setBodyHTML
                composeView.setBodyHTML(response.polishedText);

                // Clean formatting and restore signature
                cleanBodyFormatting(composeView, signatureElement, state);
            }
        } else {
            alert(`Ghostwriter Error: ${response.error}`);
        }
    } catch (error) {
        console.error('Ghostwriter: Error:', error);
        alert(`Failed to ghostwrite: ${error.message}`);
    } finally {
        setButtonLoading(button, false);
    }
}

// Extract thread context from Gmail DOM
function extractThreadContext(composeView) {
    // Check if this is a reply
    const isReply = composeView.isReply();

    if (!isReply) {
        return { type: 'compose', messages: [] };
    }

    const messages = [];
    const seenBodies = new Set(); // Track unique message bodies to avoid duplicates
    const maxMessages = 10;
    const stats = {
        totalContainers: 0,
        expandedCount: 0,
        collapsedCount: 0,
        skippedEmpty: 0,
        skippedDuplicate: 0,
        extractedCount: 0
    };

    // Gmail DOM structure:
    // - Each message in a thread is in a .gs container
    // - Expanded messages: .gs (without .gt) - has .a3s body with full content
    // - Collapsed messages: .gs.gt - has .iA.g6 span with preview snippet
    // - Sender is in span.gD with email and name attributes
    // - Quoted content (previous emails) wrapped in .gmail_quote, .gmail_quote_container,
    //   blockquote.gmail_quote, .gmail_attr, .HOEnZb, .h5 - these are filtered out

    // Find all message containers using .gs class
    const messageContainers = document.querySelectorAll('.gs');
    stats.totalContainers = messageContainers.length;

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
                stats.collapsedCount += 1;
                // Collapsed message: extract preview snippet from .iA.g6 span
                const snippetElement = msg.querySelector('.iA.g6 span, .iA span');
                if (snippetElement) {
                    body = snippetElement.textContent.trim();
                }
            } else {
                stats.expandedCount += 1;
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
                stats.skippedEmpty += 1;
                return;
            }

            // Deduplicate
            const bodyHash = body;
            if (seenBodies.has(bodyHash)) {
                stats.skippedDuplicate += 1;
                return;
            }

            seenBodies.add(bodyHash);
            collected.push({ sender, body });
        } catch (error) {
            console.warn('Ghostwriter: Error extracting message:', error);
        }
    });

    collected.reverse().forEach((message) => messages.push(message));
    stats.extractedCount = messages.length;

    console.log('Ghostwriter: Thread context stats:', {
        maxMessages,
        ...stats
    });

    return { type: 'reply', messages };
}

// Extract Gmail signature before content replacement
// Returns cloned signature element or null if not found
function extractSignature(bodyElement) {
    try {
        const signatureElement = bodyElement.querySelector('.gmail_signature');

        if (!signatureElement) {
            console.log('Ghostwriter: No signature found in compose body');
            return null;
        }

        // Clone to preserve original DOM structure and all properties
        const signatureClone = signatureElement.cloneNode(true);
        console.log('Ghostwriter: Signature extracted successfully');
        return signatureClone;
    } catch (error) {
        console.warn('Ghostwriter: Error extracting signature:', error);
        return null;
    }
}

// Clean body formatting by replacing with plain text in Gmail's native div structure
// This strips all inline styles and unwanted formatting from AI-generated content
function cleanBodyFormatting(composeView, signatureElement, state) {
    try {
        const bodyElement = safeGetBodyElement(composeView, state);

        if (!bodyElement) {
            console.warn('Ghostwriter: Could not find body element for formatting cleanup');
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
            console.log('Ghostwriter: Signature restored after formatting cleanup');
        }
    } catch (error) {
        console.warn('Ghostwriter: Error cleaning formatting:', error);
    }
}

// Track loading state (InboxSDK compose buttons don't support setEnabled)
let isProcessing = false;

// Set button loading state
function setButtonLoading(button, isLoading) {
    isProcessing = isLoading;
}
