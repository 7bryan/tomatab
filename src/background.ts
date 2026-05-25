const DEFAULT_STATE = {
  workMinutes: 25,
  breakMinutes: 5,
  secondsLeft: 25 * 60,
  isRunning: false,
  mode: 'work' as 'work' | 'break',
};

let timerInterval: ReturnType<typeof setInterval> | null = null;
let timeUpTriggered = false;

async function getState() {
  const result = await chrome.storage.local.get(DEFAULT_STATE);
  return result as typeof DEFAULT_STATE;
}

async function setState(partial: Partial<typeof DEFAULT_STATE>) {
  await chrome.storage.local.set(partial);
}

async function playAlarmSound() {
  // Create offscreen document if it doesn't exist
  const existing = await chrome.offscreen.hasDocument();
  if (!existing) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: 'Play alarm sound when timer ends'
    });
  }
  chrome.runtime.sendMessage({ action: 'playAlarm' });
}

async function startTimer() {
  const state = await getState();
  if (timerInterval) clearInterval(timerInterval);
  timeUpTriggered = false;

  await setState({ isRunning: true });

  timerInterval = setInterval(async () => {
    const s = await getState();

    if (s.secondsLeft <= 0) {
      if (!timeUpTriggered) {
        timeUpTriggered = true;
        await triggerTimeUp();
      }
      return;
    }

    const next = s.secondsLeft - 1;
    await setState({ secondsLeft: next });
    chrome.runtime.sendMessage({ action: 'tick', secondsLeft: next }).catch(() => { });

    if (next === 0) {
      if (!timeUpTriggered) {
        timeUpTriggered = true;
        await triggerTimeUp();
      }
    }
  }, 1000);

  chrome.alarms.create('pomodoro-alarm', { delayInMinutes: state.secondsLeft / 60 });
}

async function pauseTimer() {
  await setState({ isRunning: false });
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  chrome.alarms.clear('pomodoro-alarm');
}

async function triggerTimeUp() {
  const state = await getState();
  const prevMode = state.mode; // save before switching

  // Stop everything
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  await setState({ isRunning: false });
  chrome.alarms.clear('pomodoro-alarm');

  // Switch mode
  const nextMode = prevMode === 'work' ? 'break' : 'work';
  const nextSeconds = nextMode === 'work' ? state.workMinutes * 60 : state.breakMinutes * 60;
  await setState({ mode: nextMode, secondsLeft: nextSeconds });

  // Store prevMode so overlay knows what to show when popup opens
  await chrome.storage.local.set({ pendingNotification: prevMode });

  // Badge on extension icon
  chrome.action.setBadgeText({ text: '!' });
  chrome.action.setBadgeBackgroundColor({ color: '#e63b2e' });

  //play alarm sound via offscreen
  await playAlarmSound();

  // OS notification
  chrome.notifications.clear('pomodoro-done', () => {
    chrome.notifications.create('pomodoro-done', {
      type: 'basic',
      title: prevMode === 'work' ? '🍅 Work session done!' : '☕ Break over!',
      message: prevMode === 'work' ? 'Time to take a break.' : 'Back to work!',
      iconUrl: chrome.runtime.getURL('icon.png'),
      priority: 2
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Notification error:', chrome.runtime.lastError.message);
      } else {
        console.log('Notification sent successfully');
      }
    });
  });

  // Tell popup if it's open — pass prevMode so overlay knows what to show
  chrome.runtime.sendMessage({ action: 'stateChanged', prevMode }).catch(() => { });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'pomodoro-alarm') {
    if (!timeUpTriggered) {
      timeUpTriggered = true;
      triggerTimeUp();
    }
  }
});

chrome.runtime.onMessage.addListener((request: any, _sender: any, sendResponse: any) => {

  if (request.action === 'ping') {
    sendResponse({ status: 'alive' });
    return true;
  }

  if (request.action === 'getState') {
    getState().then(sendResponse);
    return true;
  }

  if (request.action === 'toggleTimer') {
    getState()
      .then(s => s.isRunning ? pauseTimer() : startTimer())
      .then(() => getState())
      .then(sendResponse);
    return true;
  }

  if (request.action === 'resetTimer') {
    getState()
      .then(s => pauseTimer().then(() => setState({
        mode: 'work',
        secondsLeft: s.workMinutes * 60
      })))
      .then(() => getState())
      .then(sendResponse);
    return true;
  }

  if (request.action === 'updateConfig') {
    pauseTimer()
      .then(() => setState({
        workMinutes: request.workDuration,
        breakMinutes: request.breakDuration,
        mode: 'work',
        secondsLeft: request.workDuration * 60
      }))
      .then(() => getState())
      .then(sendResponse);
    return true;
  }
});
