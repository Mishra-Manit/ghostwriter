// Ghostwriter Content Script - InboxSDK Integration
import * as InboxSDK from '@inboxsdk/core';

// Wait for window.onload (critical for Gmail as of 2025)
window.addEventListener('load', function () {
    console.log('Ghostwriter: Initializing...');

    // Load InboxSDK with AppId
    InboxSDK.load(2, 'sdk_ghostwriter_c73a9a612c').then(function (sdk) {
        console.log('Ghostwriter: InboxSDK loaded successfully');

        // Register compose view handler
        sdk.Compose.registerComposeViewHandler(composeViewHandler);
    }).catch(function (error) {
        console.error('Ghostwriter: Failed to load InboxSDK:', error);
    });
});

// Handle each compose view
function composeViewHandler(composeView) {
    console.log('Ghostwriter: Compose view detected');

    // Add Ghostwrite button to compose footer (near Send button)
    const button = composeView.addButton({
        title: "Ghostwrite",
        iconUrl: chrome.runtime.getURL('assets/icons/icon.png'),
        type: 'MODIFIER',  // Places button in footer near Send
        onClick: function (event) {
            handleGhostwrite(event.composeView, button);
        }
    });

    console.log('Ghostwriter: Button injected');
}

// Main click handler with dual-mode logic
async function handleGhostwrite(composeView, button) {
    // Prevent double-clicks while processing
    if (isProcessing) {
        console.log('Ghostwriter: Already processing, ignoring click');
        return;
    }

    try {
        console.log('Ghostwriter: Button clicked');

        // 1. Extract draft content
        const draft = composeView.getTextContent().trim();
        console.log('Ghostwriter: Draft length:', draft.length);
        console.log('Ghostwriter: Draft extracted:', {
            length: draft.length,
            wordCount: draft.split(/\s+/).filter(w => w.length > 0).length,
            isEmpty: draft.length === 0,
            preview: draft.substring(0, 100) + (draft.length > 100 ? '...' : '')
        });

        // 2. Extract thread context
        const context = extractThreadContext(composeView);
        console.log('Ghostwriter: Context type:', context.type, 'Messages:', context.messages.length);
        console.group('Ghostwriter: Thread Context Extracted');
        console.log('Type:', context.type);
        console.log('Messages found:', context.messages.length);
        if (context.messages.length > 0) {
            context.messages.forEach((msg, i) => {
                console.log(`Message ${i}:`, {
                    sender: msg.sender,
                    bodyLength: msg.body.length,
                    bodyPreview: msg.body.substring(0, 60) + (msg.body.length > 60 ? '...' : '')
                });
            });
        }
        console.groupEnd();

        // 3. Get user's selected tone from storage
        const { tone, anthropicApiKey } = await chrome.storage.local.get(['tone', 'anthropicApiKey']);
        const selectedTone = tone || 'Professional';
        console.log('Ghostwriter: Tone:', selectedTone);
        console.log('Ghostwriter: API key validation:', {
            present: !!anthropicApiKey,
            length: anthropicApiKey ? anthropicApiKey.length : 0,
            startsWithPrefix: anthropicApiKey ? anthropicApiKey.startsWith('sk-ant-') : false
        });

        // Check if API key is configured
        if (!anthropicApiKey) {
            alert('Please configure your Anthropic API key by clicking the Ghostwriter extension icon.');
            return;
        }

        // 4. Determine mode: Polish (has draft) vs Generate (empty draft)
        const mode = draft.length > 0 ? 'polish' : 'generate';
        console.log('Ghostwriter: Mode:', mode);

        // 5. For generate mode, validate we have context
        if (mode === 'generate' && context.messages.length === 0) {
            alert('Cannot generate draft: No existing thread context found. Please write a draft first.');
            return;
        }

        // 6. Set loading state
        setButtonLoading(button, true);

        // 7. Send to background service worker
        console.log('Ghostwriter: Sending request to background worker');
        console.group('Ghostwriter: Preparing GHOSTWRITE_REQUEST Payload');
        console.log('Payload structure:', {
            draft: {
                length: draft.length,
                preview: draft.substring(0, 50) + (draft.length > 50 ? '...' : ''),
                isEmpty: draft.length === 0
            },
            context: {
                type: context.type,
                messageCount: context.messages.length,
                messages: context.messages.map(m => ({
                    sender: m.sender,
                    bodyLength: m.body.length,
                    bodyPreview: m.body.substring(0, 40) + (m.body.length > 40 ? '...' : '')
                }))
            },
            tone: selectedTone,
            mode: mode
        });
        console.log('Sending to background script...');
        console.groupEnd();
        const response = await chrome.runtime.sendMessage({
            type: 'GHOSTWRITE_REQUEST',
            payload: {
                draft,
                context,
                tone: selectedTone,
                mode  // 'polish' or 'generate'
            }
        });

        console.log('Ghostwriter: Received response:', response.success ? 'success' : 'error');

        // 8. Handle response
        if (response.success) {
            // Check if this is a new email with subject and body
            if (response.isNewEmail && response.subject && response.body) {
                console.log('Ghostwriter: New email with subject and body');

                // Set the subject line
                composeView.setSubject(response.subject);
                console.log('Ghostwriter: Subject set:', response.subject);

                // Use InboxSDK's setBodyHTML for initial insertion, then immediately clean formatting
                composeView.setBodyHTML(response.body);
                console.log('Ghostwriter: Body inserted with setBodyHTML');

                // Immediately clean up formatting using plain text replacement
                cleanBodyFormatting(composeView);
                console.log('Ghostwriter: Body formatting cleaned');
            } else {
                // Reply or polish mode - use InboxSDK's setBodyHTML, then clean
                composeView.setBodyHTML(response.polishedText);
                console.log('Ghostwriter: Draft inserted with setBodyHTML');

                // Immediately clean up formatting using plain text replacement
                cleanBodyFormatting(composeView);
                console.log('Ghostwriter: Draft formatting cleaned');
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
    console.log('Ghostwriter: extractThreadContext called, isReply:', isReply);

    if (!isReply) {
        return { type: 'compose', messages: [] };
    }

    const messages = [];
    const seenBodies = new Set(); // Track unique message bodies to avoid duplicates

    // Gmail DOM structure:
    // - Each message in a thread is in a .gs container
    // - Expanded messages: .gs (without .gt) - has .a3s body with full content
    // - Collapsed messages: .gs.gt - has .iA.g6 span with preview snippet
    // - Sender is in span.gD with email and name attributes
    // - Quoted content (previous emails) wrapped in .gmail_quote, .gmail_quote_container,
    //   blockquote.gmail_quote, .gmail_attr, .HOEnZb, .h5 - these are filtered out

    // Find all message containers using .gs class
    const messageContainers = document.querySelectorAll('.gs');

    console.log('Ghostwriter: DOM query results:', {
        totalMessagesFound: messageContainers.length,
        selectorsUsed: '.gs'
    });

    if (messageContainers.length === 0) {
        console.log('Ghostwriter: No .gs containers found');
        return { type: 'reply', messages: [] };
    }

    // Get last 5 messages to have more candidates, then filter to 3 valid ones
    const recentMessages = Array.from(messageContainers).slice(-5);

    recentMessages.forEach((msg, index) => {
        if (messages.length >= 3) return;

        try {
            const isCollapsed = msg.classList.contains('gt');
            console.log(`Ghostwriter: Extracting message ${index}, collapsed: ${isCollapsed}`);

            let body = '';
            let sender = 'Unknown';

            // Extract sender - .gD has the sender name
            const senderElement = msg.querySelector('.gD[email], .gD');
            if (senderElement) {
                // Prefer the name attribute if available, otherwise use text content
                sender = senderElement.getAttribute('name') || senderElement.textContent.trim();
            }
            console.log(`  Sender: ${sender}`);

            if (isCollapsed) {
                // Collapsed message: extract preview snippet from .iA.g6 span
                const snippetElement = msg.querySelector('.iA.g6 span, .iA span');
                if (snippetElement) {
                    body = snippetElement.textContent.trim();
                    console.log(`  [COLLAPSED] Snippet length: ${body.length}`);
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
                    console.log(`  [EXPANDED] Body length: ${body.length} (quoted content filtered)`);
                }
            }

            if (!body || body.length === 0) {
                console.log(`  SKIPPED: Empty body`);
                return;
            }

            console.log(`  Preview: ${body.substring(0, 60)}...`);

            // Deduplicate
            const bodyHash = body.substring(0, 200);
            if (seenBodies.has(bodyHash)) {
                console.log(`  SKIPPED: Duplicate message body`);
                return;
            }

            seenBodies.add(bodyHash);
            messages.push({ sender, body });
            console.log(`  SUCCESS: Added message from ${sender}`);
        } catch (error) {
            console.warn('Ghostwriter: Error extracting message:', error);
        }
    });

    console.log('Ghostwriter: extractThreadContext result:', {
        type: 'reply',
        totalExtracted: messages.length,
        messageSummary: messages.map((m, i) => `${i}: ${m.sender} (${m.body.length} chars)`)
    });

    return { type: 'reply', messages };
}

// Clean body formatting by replacing with plain text in Gmail's native div structure
// This strips all inline styles and unwanted formatting from AI-generated content
function cleanBodyFormatting(composeView) {
    try {
        const bodyElement = composeView.getBodyElement();

        if (!bodyElement) {
            console.warn('Ghostwriter: Could not find body element for formatting cleanup');
            return;
        }

        // Extract pure text content (strips all HTML/styles)
        const plainText = bodyElement.innerText;
        console.log('Ghostwriter: Cleaning formatting, text length:', plainText.length);

        // Rebuild using Gmail's native structure: each line in a <div>, empty lines as <div><br></div>
        bodyElement.innerHTML = plainText.split('\n').map(line =>
            line.trim() ? `<div>${line}</div>` : '<div><br></div>'
        ).join('');

        console.log('Ghostwriter: Formatting cleanup complete');
    } catch (error) {
        console.warn('Ghostwriter: Error cleaning formatting:', error);
    }
}

// Track loading state (InboxSDK compose buttons don't support setEnabled)
let isProcessing = false;

// Set button loading state
function setButtonLoading(button, isLoading) {
    isProcessing = isLoading;
    if (isLoading) {
        console.log('Ghostwriter: Processing started');
    } else {
        console.log('Ghostwriter: Processing complete');
    }
}
