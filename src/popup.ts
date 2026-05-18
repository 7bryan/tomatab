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

// Toggle Settings
settingsBtn.addEventListener('click', () => {
  settingsPanel.classList.toggle('hidden');
});

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

async function updateUI() {
  try {
    const state = await chrome.runtime.sendMessage({ action: 'getState' });

    timerDisplay.textContent = formatTime(state.secondsLeft);
    timerLabel.textContent = state.mode === 'work' ? 'Work Session' : 'Break Time';

    if (state.mode === 'break') {
      timerLabel.classList.replace('text-slate-400', 'text-emerald-400');
    } else {
      timerLabel.classList.replace('text-emerald-400', 'text-slate-400');
    }

    if (state.isRunning) {
      startStopBtn.textContent = 'Pause';
      startStopBtn.classList.add('bg-amber-600');
    } else {
      startStopBtn.textContent = 'Start';
      startStopBtn.classList.remove('bg-amber-600');
    }
  } catch (err) {
    console.error("Popup window disconnected from background worker context.", err);
  }
}

startStopBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ action: 'toggleTimer' });
  updateUI();
});

resetBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ action: 'resetTimer' });
  updateUI();
});

saveSettingsBtn.addEventListener('click', async () => {
  const workMins = parseInt(workDurationInput.value) || 25;
  const breakMins = parseInt(breakDurationInput.value) || 5;

  await chrome.runtime.sendMessage({
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

// Load state when popup is clicked open
updateUI();
