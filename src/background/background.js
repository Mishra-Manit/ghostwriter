import { buildSystemPrompt, buildUserMessage } from './prompts.js';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'inboxsdk__injectPageWorld' && sender.tab) {
    if (chrome.scripting) {
      let documentIds;
      let frameIds;
      if (sender.documentId) {
        documentIds = [sender.documentId];
      } else {
        frameIds = [sender.frameId];
      }
      chrome.scripting.executeScript({
        target: { tabId: sender.tab.id, documentIds, frameIds },
        world: 'MAIN',
        files: ['pageWorld.js'],
      });
      sendResponse(true);
    } else {
      sendResponse(false);
    }
    return;
  }

  if (message.type === 'GHOSTWRITE_REQUEST') {
    handleGhostwriteRequest(message.payload)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({
        success: false,
        error: error.message || 'Unknown error occurred'
      }));

    // Keep the message channel open for async sendResponse.
    return true;
  }
});

async function handleGhostwriteRequest({ draft, context, tone, mode }) {
  const { anthropicApiKey } = await chrome.storage.local.get(['anthropicApiKey']);

  if (!anthropicApiKey) {
    return {
      success: false,
      error: 'API key not configured. Click extension icon to set up.'
    };
  }

  const systemPrompt = buildSystemPrompt(tone, mode, context.type);

  const userMessage = buildUserMessage(tone, draft, context, mode);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  const requestBody = {
    model: 'claude-sonnet-4-5',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userMessage
      }
    ]
  };

  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey.trim(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
  } catch (fetchError) {
    clearTimeout(timeout);
    if (fetchError.name === 'AbortError') {
      return {
        success: false,
        error: 'Request timed out. Please try again.'
      };
    }
    return {
      success: false,
      error: fetchError.message || 'Request failed. Please try again.'
    };
  }

  clearTimeout(timeout);

  if (!response.ok) {
    const errorText = await response.text();

    let errorData = {};
    try {
      errorData = JSON.parse(errorText);
    } catch (e) {
      // Non-JSON errors fall back to raw error text below.
    }

    if (response.status === 401) {
      return {
        success: false,
        error: `Invalid API key (401). Details: ${errorData.error?.message || errorText}`
      };
    }

    if (response.status === 429) {
      return {
        success: false,
        error: 'Rate limit exceeded. Please wait a moment and try again.'
      };
    }

    return {
      success: false,
      error: errorData.error?.message || `API request failed (${response.status}): ${errorText}`
    };
  }

  const data = await response.json();

  if (!data.content || !data.content[0] || !data.content[0].text) {
    return {
      success: false,
      error: 'Invalid API response format'
    };
  }

  const rawText = data.content[0].text;

  if (context.type === 'compose') {
    try {
      let jsonText = rawText.trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      }

      const jsonResponse = JSON.parse(jsonText);
      if (jsonResponse.subject && jsonResponse.body) {
        return {
          success: true,
          isNewEmail: true,
          subject: jsonResponse.subject,
          body: jsonResponse.body
        };
      }
    } catch (parseError) {
      // If parse fails, treat output as plain polished text.
    }
  }

  return {
    success: true,
    isNewEmail: false,
    polishedText: rawText
  };
}
