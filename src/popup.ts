const timerDisplay = document.getElementById('timerDisplay') as HTMLDivElement;
const timerLabel = document.getElementById('timerLabel') as HTMLDivElement;
const startStopBtn = document.getElementById('startStopBtn') as HTMLButtonElement;
const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;
const settingsPanel = document.getElementById('settingsPanel') as HTMLDivElement;
const saveSettingsBtn = document.getElementById('saveSettingsBtn') as HTMLButtonElement;
const workDurationInput = document.getElementById('workDuration') as HTMLInputElement;
const breakDurationInput = document.getElementById('breakDuration') as HTMLInputElement;
const taskInput = document.getElementById('taskInput') as HTMLInputElement;
const doneOverlay = document.getElementById('doneOverlay') as HTMLDivElement;
const doneEmoji = document.getElementById('doneEmoji') as HTMLDivElement;
const doneTitle = document.getElementById('doneTitle') as HTMLDivElement;
const doneMessage = document.getElementById('doneMessage') as HTMLDivElement;
const dismissBtn = document.getElementById('dismissBtn') as HTMLButtonElement;

// Load saved task
chrome.storage.local.get('currentTask', (result) => {
  taskInput.value = result.currentTask || '';
});

// Save task on change
taskInput.addEventListener('input', () => {
  chrome.storage.local.set({ currentTask: taskInput.value });
});

// Toggle settings panel
settingsBtn.addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
});

// Dismiss overlay
dismissBtn.addEventListener('click', () => {
  doneOverlay.classList.add('hidden');
});

function showOverlay(prevMode: 'work' | 'break') {
  if (prevMode === 'work') {
    doneEmoji.textContent = '🍅';
    doneTitle.textContent = 'Work session done!';
    doneMessage.textContent = 'Time to take a break.';
  } else {
    doneEmoji.textContent = '☕';
    doneTitle.textContent = 'Break over!';
    doneMessage.textContent = 'Back to work!';
  }
  doneOverlay.classList.remove('hidden');
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

async function sendMessage(msg: object): Promise<any> {
  for (let i = 0; i < 3; i++) {
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch {
      if (i < 2) await new Promise(r => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw new Error('Could not reach background service worker');
}

function applyState(state: any) {
  timerDisplay.textContent = formatTime(state.secondsLeft);
  timerLabel.textContent = state.mode === 'work' ? 'Work Session' : 'Break Time';

  workDurationInput.value = String(state.workMinutes);
  breakDurationInput.value = String(state.breakMinutes);

  if (state.mode === 'break') {
    timerLabel.classList.replace('text-slate-400', 'text-emerald-400');
  } else {
    timerLabel.classList.replace('text-emerald-400', 'text-slate-400');
  }

  startStopBtn.textContent = state.isRunning ? 'Pause' : 'Start';
  if (state.isRunning) {
    startStopBtn.classList.add('bg-amber-600');
  } else {
    startStopBtn.classList.remove('bg-amber-600');
  }
}

async function updateUI() {
  try {
    const state = await sendMessage({ action: 'getState' });
    applyState(state);
  } catch (err) {
    console.error("Popup disconnected from background.", err);
  }
}

startStopBtn.addEventListener('click', async () => {
  try {
    const state = await sendMessage({ action: 'toggleTimer' });
    applyState(state);
  } catch { await updateUI(); }
});

resetBtn.addEventListener('click', async () => {
  try {
    const state = await sendMessage({ action: 'resetTimer' });
    applyState(state);
  } catch { await updateUI(); }
});

saveSettingsBtn.addEventListener('click', async () => {
  const workMins = parseInt(workDurationInput.value) || 25;
  const breakMins = parseInt(breakDurationInput.value) || 5;

  try {
    const state = await sendMessage({
      action: 'updateConfig',
      workDuration: workMins,
      breakDuration: breakMins
    });
    applyState(state);
  } catch { await updateUI(); }

  settingsPanel.classList.add('hidden');
});

chrome.runtime.onMessage.addListener((message: any) => {
  if (message.action === 'tick') {
    timerDisplay.textContent = formatTime(message.secondsLeft);
  } else if (message.action === 'stateChanged') {
    // popup is open when timer ends — show overlay immediately
    showOverlay(message.prevMode);
    updateUI();
  }
});

// Wake up service worker, clear badge, check pending notification
(async () => {
  chrome.action.setBadgeText({ text: '' });
  try {
    await chrome.runtime.sendMessage({ action: 'ping' });
  } catch { }

  // Check if timer ended while popup was closed
  chrome.storage.local.get('pendingNotification', (result) => {
    if (result.pendingNotification) {
      chrome.storage.local.remove('pendingNotification');
      showOverlay(result.pendingNotification); // prevMode stored as the value
    }
  });

  updateUI();
})();
