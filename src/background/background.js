// Ghostwriter Background Service Worker
// Handles Anthropic API calls with Claude Sonnet 4.5

import { buildSystemPrompt, buildUserMessage } from './prompts.js';

console.log('Ghostwriter: Background service worker initialized');

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
    console.log('Ghostwriter: Received ghostwrite request');

    // Handle async API call
    handleGhostwriteRequest(message.payload)
      .then(result => {
        console.log('Ghostwriter: Sending response:', result.success ? 'success' : 'error');
        sendResponse(result);
      })
      .catch(error => {
        console.error('Ghostwriter: Request handler error:', error);
        sendResponse({
          success: false,
          error: error.message || 'Unknown error occurred'
        });
      });

    // Return true to keep the message channel open for async response
    return true;
  }
});

// Main API request handler
async function handleGhostwriteRequest({ draft, context, tone, mode }) {
  try {
    console.log('Ghostwriter: Processing request - Mode:', mode, 'Tone:', tone);
    console.group('Ghostwriter: handleGhostwriteRequest Processing');
    console.log('Request details:', {
      mode: mode,
      tone: tone,
      contextType: context.type,
      messagesInContext: context.messages.length,
      draftLength: draft.length
    });
    console.groupEnd();

    // 1. Get API key and custom tone preferences from storage
    const { anthropicApiKey, customTonePreferences } = await chrome.storage.local.get(['anthropicApiKey', 'customTonePreferences']);

    // DEBUG: Log API key info (masked for security)
    if (!anthropicApiKey) {
      console.error('Ghostwriter: No API key found in storage');
      throw new Error('API key not configured. Click extension icon to set up.');
    }

    const keyLength = anthropicApiKey.length;
    const maskedKey = anthropicApiKey.substring(0, 10) + '...' + anthropicApiKey.substring(keyLength - 4);
    console.log('Ghostwriter: API key found - Length:', keyLength, 'Preview:', maskedKey);

    // Check for common API key issues
    if (anthropicApiKey.includes(' ') || anthropicApiKey.includes('\n') || anthropicApiKey.includes('\r')) {
      console.error('Ghostwriter: API key contains whitespace or newlines!');
    }
    if (!anthropicApiKey.startsWith('sk-ant-')) {
      console.warn('Ghostwriter: API key does not start with expected prefix "sk-ant-"');
    }

    // 2. Build system prompt based on tone, mode, and context
    const systemPrompt = buildSystemPrompt(tone, mode, context.type, customTonePreferences);
    console.log('Ghostwriter: System prompt built');
    console.log('Ghostwriter: System prompt details:', {
      length: systemPrompt.length,
      tone: tone,
      customPreferences: tone === 'Custom' ? customTonePreferences : null,
      mode: mode,
      contextType: context.type,
      fullPrompt: systemPrompt
    });

    // 3. Build user message
    const userMessage = buildUserMessage(draft, context, mode);
    console.log('Ghostwriter: User message built, length:', userMessage.length);
    console.log('Ghostwriter: User message details:', {
      totalLength: userMessage.length,
      hasContext: context.messages.length > 0,
      contextMessageCount: context.messages.length,
      fullMessage: userMessage
    });

    // 4. Call Anthropic API
    console.log('Ghostwriter: Calling Anthropic API...');
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

    console.group('Ghostwriter: Anthropic API Request');
    console.log('Endpoint: https://api.anthropic.com/v1/messages');
    console.log('Model: claude-sonnet-4-5-20250929');
    console.log('Max tokens: 2048');
    console.log('Request body:', JSON.stringify(requestBody, null, 2));
    console.groupEnd();

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
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

      clearTimeout(timeout);

      console.log('Ghostwriter: Response status:', response.status);
      console.log('Ghostwriter: Response headers:', Object.fromEntries(response.headers.entries()));

      // Handle API errors
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Ghostwriter: Full error response:', errorText);

        let errorData = {};
        try {
          errorData = JSON.parse(errorText);
        } catch (e) {
          console.error('Ghostwriter: Could not parse error as JSON');
        }

        console.error('Ghostwriter: API error details:', {
          status: response.status,
          statusText: response.statusText,
          errorData: errorData
        });

        if (response.status === 401) {
          throw new Error(`Invalid API key (401). Details: ${errorData.error?.message || errorText}`);
        } else if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please wait a moment and try again.');
        } else {
          throw new Error(errorData.error?.message || `API request failed (${response.status}): ${errorText}`);
        }
      }

      // 5. Parse response
      const data = await response.json();
      console.log('Ghostwriter: API response received');

      if (!data.content || !data.content[0] || !data.content[0].text) {
        throw new Error('Invalid API response format');
      }

      const rawText = data.content[0].text;
      console.log('Ghostwriter: Raw response length:', rawText.length);
      console.log('Ghostwriter: API response processed:', {
        contentType: data.content[0].type,
        outputLength: rawText.length,
        outputPreview: rawText.substring(0, 100) + (rawText.length > 100 ? '...' : '')
      });

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
            console.log('Ghostwriter: Parsed JSON response with subject and body');
            return {
              success: true,
              isNewEmail: true,
              subject: jsonResponse.subject,
              body: jsonResponse.body
            };
          }
        } catch (parseError) {
          console.warn('Ghostwriter: Could not parse as JSON, treating as plain HTML:', parseError);
        }
      }

      // For replies or if JSON parsing fails, return as polishedText
      return {
        success: true,
        isNewEmail: false,
        polishedText: rawText
      };

    } catch (fetchError) {
      clearTimeout(timeout);

      if (fetchError.name === 'AbortError') {
        throw new Error('Request timed out. Please try again.');
      }
      throw fetchError;
    }

  } catch (error) {
    console.error('Ghostwriter: Error in handleGhostwriteRequest:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    };
  }
}
