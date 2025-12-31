// Load saved settings when popup opens
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Load API key and tone from storage
    const { anthropicApiKey, tone } = await chrome.storage.local.get([
      'anthropicApiKey',
      'tone'
    ]);

    // Show compact or full API key section based on whether key exists
    if (anthropicApiKey) {
      showApiKeyCompact();
    } else {
      showApiKeyFull(false); // No cancel button for first-time setup
    }

    // Highlight selected tone (default: Regular)
    const selectedTone = tone || 'Regular';
    highlightTone(selectedTone);
  } catch (error) {
    console.error('Error loading settings:', error);
    showStatus('Error loading settings', 'error');
  }
});

// Helper: Show compact API key view
function showApiKeyCompact() {
  document.getElementById('apiKeyCompact').classList.remove('hidden');
  document.getElementById('apiKeyFull').classList.add('hidden');
}

// Helper: Show full API key form
function showApiKeyFull(showCancel = true) {
  document.getElementById('apiKeyCompact').classList.add('hidden');
  document.getElementById('apiKeyFull').classList.remove('hidden');

  const cancelBtn = document.getElementById('cancelKeyButton');
  if (showCancel) {
    cancelBtn.classList.remove('hidden');
  } else {
    cancelBtn.classList.add('hidden');
  }
}

// Change API Key button
document.getElementById('changeKeyButton').addEventListener('click', async () => {
  // Load current key into input for editing
  const { anthropicApiKey } = await chrome.storage.local.get(['anthropicApiKey']);
  document.getElementById('apiKeyInput').value = anthropicApiKey || '';
  showApiKeyFull(true);
});

// Cancel API Key edit
document.getElementById('cancelKeyButton').addEventListener('click', () => {
  showApiKeyCompact();
});

// Save API key
document.getElementById('saveKeyButton').addEventListener('click', async () => {
  const apiKey = document.getElementById('apiKeyInput').value.trim();

  if (!apiKey) {
    showStatus('Please enter an API key', 'error');
    return;
  }

  // Validate API key format
  if (!apiKey.startsWith('sk-ant-')) {
    const confirmed = confirm(
      'API key format looks unusual. Anthropic API keys typically start with "sk-ant-". Save anyway?'
    );
    if (!confirmed) return;
  }

  try {
    await chrome.storage.local.set({ anthropicApiKey: apiKey });
    showApiKeyCompact();
    showStatus('API key saved!', 'success');
  } catch (error) {
    console.error('Error saving API key:', error);
    showStatus('Error saving API key', 'error');
  }
});

// Tone selection
document.querySelectorAll('.tone-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const tone = btn.dataset.tone;

    try {
      await chrome.storage.local.set({ tone });
      highlightTone(tone);
      showStatus(`Tone set to ${tone}`, 'success');
    } catch (error) {
      console.error('Error saving tone:', error);
      showStatus('Error saving tone', 'error');
    }
  });
});

// Helper: Highlight selected tone button
function highlightTone(selectedTone) {
  document.querySelectorAll('.tone-btn').forEach(btn => {
    if (btn.dataset.tone === selectedTone) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

// Helper: Show status message
function showStatus(message, type) {
  const statusElement = document.getElementById('status');
  statusElement.textContent = message;
  statusElement.className = `status ${type}`;

  // Clear status after 3 seconds
  setTimeout(() => {
    statusElement.textContent = '';
    statusElement.className = 'status';
  }, 3000);
}

// Allow Enter key to save API key
document.getElementById('apiKeyInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('saveKeyButton').click();
  }
});
