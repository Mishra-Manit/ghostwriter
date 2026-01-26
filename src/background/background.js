// Ghostwriter Background Service Worker
// Handles Anthropic API calls with Claude Sonnet 4.5

import { buildSystemPrompt, buildUserMessage } from './prompts.js';

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // InboxSDK MV3: Handle pageWorld.js injection
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
    // Handle async API call
    handleGhostwriteRequest(message.payload)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({
        success: false,
        error: error.message || 'Unknown error occurred'
      }));

    // Return true to keep the message channel open for async response
    return true;
  }
});

// Main API request handler
async function handleGhostwriteRequest({ draft, context, tone, mode }) {
  // 1. Get API key from storage
  const { anthropicApiKey } = await chrome.storage.local.get(['anthropicApiKey']);

  if (!anthropicApiKey) {
    return {
      success: false,
      error: 'API key not configured. Click extension icon to set up.'
    };
  }

  // 2. Build system prompt based on tone, mode, and context
  const systemPrompt = buildSystemPrompt(tone, mode, context.type);

  // 3. Build user message
  const userMessage = buildUserMessage(tone, draft, context, mode);

  // 4. Call Anthropic API
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  const requestBody = {
    model: 'claude-sonnet-4-5',  // Latest Claude Sonnet 4.5
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
        'x-api-key': anthropicApiKey.trim(),  // Trim whitespace just in case
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'  // Required for browser requests
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
      // Ignore parse errors for non-JSON error bodies
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

  // 5. Parse response
  const data = await response.json();

  if (!data.content || !data.content[0] || !data.content[0].text) {
    return {
      success: false,
      error: 'Invalid API response format'
    };
  }

  const rawText = data.content[0].text;

  // For new compose emails (not replies), parse JSON response
  if (context.type === 'compose') {
    try {
      // Strip markdown code blocks if present (e.g., ```json ... ```)
      let jsonText = rawText.trim();
      if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
      }

      // Try to parse as JSON for new emails
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
      // Ignore parse errors, fall back to plain HTML handling
    }
  }

  // For replies or if JSON parsing fails, return as polishedText
  return {
    success: true,
    isNewEmail: false,
    polishedText: rawText
  };
}
