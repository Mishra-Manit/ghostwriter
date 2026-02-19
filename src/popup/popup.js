document.addEventListener('DOMContentLoaded', async () => {
  try {
    const { anthropicApiKey, tone } = await chrome.storage.local.get([
      'anthropicApiKey',
      'tone'
    ]);

    if (anthropicApiKey) {
      showApiKeyCompact();
    } else {
      showApiKeyFull(false);
    }

    const selectedTone = tone || 'Regular';
    highlightTone(selectedTone);
  } catch (error) {
    console.error('Error loading settings:', error);
    showStatus('Error loading settings', 'error');
  }
});

function showApiKeyCompact() {
  document.getElementById('apiKeyCompact').classList.remove('hidden');
  document.getElementById('apiKeyFull').classList.add('hidden');
}

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

document.getElementById('changeKeyButton').addEventListener('click', async () => {
  const { anthropicApiKey } = await chrome.storage.local.get(['anthropicApiKey']);
  document.getElementById('apiKeyInput').value = anthropicApiKey || '';
  showApiKeyFull(true);
});

document.getElementById('cancelKeyButton').addEventListener('click', () => {
  showApiKeyCompact();
});

document.getElementById('saveKeyButton').addEventListener('click', async () => {
  const apiKey = document.getElementById('apiKeyInput').value.trim();

  if (!apiKey) {
    showStatus('Please enter an API key', 'error');
    return;
  }

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

document.querySelectorAll('.tone-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    const tone = btn.dataset.tone;

    try {
      await chrome.storage.local.set({ tone });
      highlightTone(tone);
    } catch (error) {
      console.error('Error saving tone:', error);
      showStatus('Error saving tone', 'error');
    }
  });
});

function highlightTone(selectedTone) {
  const buttons = document.querySelectorAll('.tone-btn');
  const indicator = document.querySelector('.segmented-indicator');

  buttons.forEach((btn, index) => {
    if (btn.dataset.tone === selectedTone) {
      btn.classList.add('active');

      if (indicator) {
        const offset = index * btn.offsetWidth;
        indicator.style.transform = `translateX(${offset}px)`;
      }
    } else {
      btn.classList.remove('active');
    }
  });
}

function showStatus(message, type) {
  const statusElement = document.getElementById('status');
  statusElement.textContent = message;
  statusElement.className = `status ${type}`;

  setTimeout(() => {
    statusElement.textContent = '';
    statusElement.className = 'status';
  }, 3000);
}

document.getElementById('apiKeyInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('saveKeyButton').click();
  }
});
