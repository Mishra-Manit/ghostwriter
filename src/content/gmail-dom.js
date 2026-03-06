const QUOTED_CONTENT_SELECTORS =
    '.gmail_quote, .gmail_quote_container, blockquote.gmail_quote, ' +
    '.gmail_attr, .HOEnZb, .h5';

function normalizeForComparison(text) {
    return text.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function isDuplicate(normalizedBody, seenNormalized) {
    for (const seen of seenNormalized) {
        if (seen === normalizedBody) return { duplicate: true, replacesIndex: -1 };
        if (seen.startsWith(normalizedBody)) return { duplicate: true, replacesIndex: -1 };
    }
    return { duplicate: false, replacesIndex: -1 };
}

function findSnippetToReplace(normalizedBody, seenNormalized) {
    for (let i = 0; i < seenNormalized.length; i++) {
        if (normalizedBody.startsWith(seenNormalized[i]) && normalizedBody !== seenNormalized[i]) {
            return i;
        }
    }
    return -1;
}

export function extractThreadContext(composeView) {
    const isReply = composeView.isReply();

    if (!isReply) {
        return { type: 'compose', messages: [] };
    }

    const maxMessages = 10;
    const messageContainers = document.querySelectorAll('.gs');

    if (messageContainers.length === 0) {
        return { type: 'reply', messages: [] };
    }

    const seenNormalized = [];
    const collected = [];

    // Gmail renders newest first. We collect newest->oldest, then reverse back to chronological.
    const orderedMessages = Array.from(messageContainers).reverse();

    orderedMessages.forEach((msg) => {
        if (collected.length >= maxMessages) return;

        try {
            const isCollapsed = msg.classList.contains('gt');

            let body = '';
            let sender = 'Unknown';

            const senderElement = msg.querySelector('.gD[email], .gD');
            if (senderElement) {
                sender = senderElement.getAttribute('name') || senderElement.textContent.trim();
            }

            if (isCollapsed) {
                const snippetElement = msg.querySelector('.iA.g6 span, .iA span');
                if (snippetElement) {
                    body = snippetElement.textContent.trim();
                }
            } else {
                const bodyElement = msg.querySelector('.a3s.aiL, .a3s');
                if (bodyElement) {
                    const bodyClone = bodyElement.cloneNode(true);
                    bodyClone.querySelectorAll(QUOTED_CONTENT_SELECTORS).forEach(el => el.remove());
                    body = bodyClone.innerText.trim();
                }
            }

            if (!body || body.length === 0) {
                return;
            }

            const normalized = normalizeForComparison(body);

            const dupCheck = isDuplicate(normalized, seenNormalized);
            if (dupCheck.duplicate) {
                return;
            }

            const replaceIndex = findSnippetToReplace(normalized, seenNormalized);
            if (replaceIndex !== -1) {
                seenNormalized[replaceIndex] = normalized;
                collected[replaceIndex] = { sender, body };
                return;
            }

            seenNormalized.push(normalized);
            collected.push({ sender, body });
        } catch (error) {
            // Ignore single-message parse failures so one bad node doesn't break extraction.
        }
    });

    return { type: 'reply', messages: collected.reverse() };
}

export function extractFullThreadForCopy() {
    const subjectEl = document.querySelector('h2.hP');
    const subject = subjectEl ? subjectEl.textContent.trim() : 'No Subject';

    const messageContainers = document.querySelectorAll('.gs');
    const seenNormalized = [];
    const messages = [];

    messageContainers.forEach((msg) => {
        try {
            const isCollapsed = msg.classList.contains('gt');

            let body = '';
            let sender = 'Unknown';
            let date = '';

            const senderElement = msg.querySelector('.gD[email], .gD');
            if (senderElement) {
                sender = senderElement.getAttribute('name') || senderElement.textContent.trim();
            }

            const dateElement = msg.querySelector('.g3') || msg.querySelector('span.gH span[title]');
            if (dateElement) {
                date = dateElement.getAttribute('title') || dateElement.textContent.trim();
            }

            if (isCollapsed) {
                const snippetElement = msg.querySelector('.iA.g6 span, .iA span');
                if (snippetElement) {
                    body = snippetElement.textContent.trim();
                }
            } else {
                const bodyElement = msg.querySelector('.a3s.aiL, .a3s');
                if (bodyElement) {
                    const bodyClone = bodyElement.cloneNode(true);
                    bodyClone.querySelectorAll(QUOTED_CONTENT_SELECTORS).forEach(el => el.remove());
                    body = bodyClone.innerText.trim();
                }
            }

            if (!body || body.length === 0) return;

            const normalized = normalizeForComparison(body);

            const dupCheck = isDuplicate(normalized, seenNormalized);
            if (dupCheck.duplicate) return;

            const replaceIndex = findSnippetToReplace(normalized, seenNormalized);
            if (replaceIndex !== -1) {
                seenNormalized[replaceIndex] = normalized;
                messages[replaceIndex] = { sender, date, body };
                return;
            }

            seenNormalized.push(normalized);
            messages.push({ sender, date, body });
        } catch (error) {
            console.debug('Ghostwriter: Skipped message during extraction:', error);
        }
    });

    return { subject, messages };
}

export function formatThreadAsMarkdown(subject, messages) {
    const lines = [];
    lines.push(`# ${subject}`);
    lines.push('');

    messages.forEach((msg) => {
        lines.push('---');
        lines.push('');
        lines.push(`## From: ${msg.sender}`);
        if (msg.date) {
            lines.push(`*${msg.date}*`);
        }
        lines.push('');
        lines.push(msg.body);
        lines.push('');
    });

    return lines.join('\n');
}
