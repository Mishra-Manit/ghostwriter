// Ghostwriter Background Service Worker
// Handles Anthropic API calls with Claude Sonnet 4.5

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

    // 1. Get API key from storage
    const { anthropicApiKey } = await chrome.storage.local.get(['anthropicApiKey']);

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
    const systemPrompt = buildSystemPrompt(tone, mode, context.type);
    console.log('Ghostwriter: System prompt built');
    console.log('Ghostwriter: System prompt details:', {
      length: systemPrompt.length,
      tone: tone,
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

      const polishedText = data.content[0].text;
      console.log('Ghostwriter: Polished text length:', polishedText.length);
      console.log('Ghostwriter: API response processed:', {
        contentType: data.content[0].type,
        outputLength: polishedText.length,
        outputPreview: polishedText.substring(0, 100) + (polishedText.length > 100 ? '...' : '')
      });

      return {
        success: true,
        polishedText
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

// Build tone-aware system prompt with context awareness
function buildSystemPrompt(tone, mode, contextType) {
  const toneDescriptions = {
    'Professional': 'professional and formal',
    'Friendly': 'warm and approachable',
    'Confident': 'assertive and direct'
  };

  const toneStyle = toneDescriptions[tone] || 'professional';

  // Add context-specific instructions
  const contextInstruction = contextType === 'reply'
    ? ' IMPORTANT: This is a reply to an existing email thread, so DO NOT include a subject line - only provide the email body.'
    : ' Include both a subject line and email body.';

  // Add formatting instruction for HTML output (will be wrapped in div)
  const formattingInstruction = ' Format your response using simple HTML tags for structure: use <p> for paragraphs, <br> for line breaks, <strong> for bold, <em> for emphasis. Keep it clean and simple - NO <html>, <head>, or <body> tags, just the content tags.';

  if (mode === 'polish') {
    return `You are a professional email ghostwriter. Polish the provided draft into a ${toneStyle} email. Maintain the user's intent but improve clarity, tone, and professionalism. Keep it concise and ready to send.${contextInstruction}${formattingInstruction}`;
  } else {
    return `You are a professional email ghostwriter. Based on the thread context provided, generate a ${toneStyle} email response. Be contextually appropriate, concise, and ready to send.${contextInstruction}${formattingInstruction}`;
  }
}

// Build user message with context
function buildUserMessage(draft, context, mode) {
  let message = '';

  // Add thread context if available
  if (context.type === 'reply' && context.messages && context.messages.length > 0) {
    message += "Previous messages in thread:\n\n";

    context.messages.forEach((msg, i) => {
      message += `Message ${i + 1} from ${msg.sender}:\n${msg.body}\n\n`;
    });

    message += "---\n\n";
  }

  if (mode === 'polish') {
    message += `My draft:\n${draft}\n\nPlease polish this into a ready-to-send email.`;
  } else {
    message += `Please generate a professional email response based on the context above.`;
  }

  return message;
}
