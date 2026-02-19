const composeViewState = new WeakMap();

export function getComposeState(composeView) {
    let state = composeViewState.get(composeView);
    if (state) {
        return state;
    }

    state = { destroyed: Boolean(composeView?.destroyed), isProcessing: false };
    composeViewState.set(composeView, state);

    if (typeof composeView.on === 'function') {
        composeView.on('destroy', () => {
            state.destroyed = true;
        });
    }

    return state;
}

export function isComposeViewActive(composeView, state) {
    return !(state?.destroyed || composeView?.destroyed);
}

function safeGetBodyElement(composeView, state) {
    if (!isComposeViewActive(composeView, state)) {
        return null;
    }

    try {
        return composeView.getBodyElement();
    } catch (error) {
        // InboxSDK can throw if compose is destroyed between checks.
        return null;
    }
}

function extractSignature(bodyElement) {
    try {
        const signatureElement = bodyElement.querySelector('.gmail_signature');

        if (!signatureElement) {
            return null;
        }

        const signatureClone = signatureElement.cloneNode(true);
        return signatureClone;
    } catch (error) {
        return null;
    }
}

export function applyResponseToCompose(composeView, state, response) {
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

function cleanBodyFormatting(composeView, signatureElement, state) {
    try {
        const bodyElement = safeGetBodyElement(composeView, state);

        if (!bodyElement) {
            return;
        }

        const plainText = bodyElement.innerText;

        // Rebuild into Gmail-native div lines to strip model-added inline styling.
        bodyElement.innerHTML = plainText.split('\n').map(line =>
            line.trim() ? `<div>${line}</div>` : '<div><br></div>'
        ).join('');

        if (signatureElement) {
            bodyElement.appendChild(signatureElement);
        }
    } catch (error) {
        // Formatting cleanup should never block the generated response.
    }
}
