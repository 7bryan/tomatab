const timerDisplay = document.getElementById('timerDisplay') as HTMLDivElement;
const timerLabel = document.getElementById('timerLabel') as HTMLDivElement;
const startStopBtn = document.getElementById('startStopBtn') as HTMLButtonElement;
const resetBtn = document.getElementById('resetBtn') as HTMLButtonElement;
const settingsBtn = document.getElementById('settingsBtn') as HTMLButtonElement;
const settingsPanel = document.getElementById('settingsPanel') as HTMLDivElement;
const saveSettingsBtn = document.getElementById('saveSettingsBtn') as HTMLButtonElement;
const workDurationInput = document.getElementById('workDuration') as HTMLInputElement;
const breakDurationInput = document.getElementById('breakDuration') as HTMLInputElement;

// npx @tailwindcss/cli -i ./src/style.css -o ./dist/output.css --watch

const taskInput = document.getElementById('taskInput') as HTMLInputElement;

// load saved task
chrome.storage.local.get('currentTask', (result) => {
  taskInput.value = result.currentTask || '';
});

// save on change
taskInput.addEventListener('input', () => {
  chrome.storage.local.set({ currentTask: taskInput.value });
});

// Toggle Settings
settingsBtn.addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
});

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

// add this inside updateUI()
async function updateUI() {
  try {
    const state = await sendMessage({ action: 'getState' });

    timerDisplay.textContent = formatTime(state.secondsLeft);
    timerLabel.textContent = state.mode === 'work' ? 'Work Session' : 'Break Time';

    // sync settings inputs with actual saved values
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
  } catch (err) {
    console.error("Popup disconnected from background.", err);
  }
}

startStopBtn.addEventListener('click', async () => {
  await sendMessage({ action: 'toggleTimer' });
  updateUI();
});

resetBtn.addEventListener('click', async () => {
  await sendMessage({ action: 'resetTimer' });
  updateUI();
});

saveSettingsBtn.addEventListener('click', async () => {
  const workMins = parseInt(workDurationInput.value) || 25;
  const breakMins = parseInt(breakDurationInput.value) || 5;

  await sendMessage({
    action: 'updateConfig',
    workDuration: workMins,
    breakDuration: breakMins
  });

  settingsPanel.classList.add('hidden');
  updateUI();
});

chrome.runtime.onMessage.addListener((message: any) => {
  if (message.action === 'tick') {
    timerDisplay.textContent = formatTime(message.secondsLeft);
  } else if (message.action === 'stateChanged') {
    updateUI();
  }
});

// Wake up service worker first, then load state
(async () => {
  try {
    await chrome.runtime.sendMessage({ action: 'ping' });
  } catch { /* ignore, just waking it up */ }
  updateUI();
})();
