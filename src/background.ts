const DEFAULT_STATE = {
  workMinutes: 25,
  breakMinutes: 5,
  secondsLeft: 25 * 60,
  isRunning: false,
  mode: 'work' as 'work' | 'break',
};

let timerInterval: ReturnType<typeof setInterval> | null = null;

async function getState() {
  const result = await chrome.storage.local.get(DEFAULT_STATE);
  return result as typeof DEFAULT_STATE;
}

async function setState(partial: Partial<typeof DEFAULT_STATE>) {
  await chrome.storage.local.set(partial);
}

async function startTimer() {
  const state = await getState();
  if (timerInterval) clearInterval(timerInterval);

  await setState({ isRunning: true });

  timerInterval = setInterval(async () => {
    const s = await getState();
    if (s.secondsLeft > 0) {
      await setState({ secondsLeft: s.secondsLeft - 1 });
      chrome.runtime.sendMessage({ action: 'tick', secondsLeft: s.secondsLeft - 1 }).catch(() => { });
    } else {
      await triggerTimeUp();
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
  await pauseTimer();

  const nextMode = state.mode === 'work' ? 'break' : 'work';
  const nextSeconds = nextMode === 'work' ? state.workMinutes * 60 : state.breakMinutes * 60;

  await setState({ mode: nextMode, secondsLeft: nextSeconds });

  chrome.notifications.create('pomodoro-done', {
    type: 'basic',
    title: "Time's up!",
    message: state.mode === 'work' ? 'Take a break!' : 'Back to work!',
    iconUrl: 'icon.png'
  });

  chrome.runtime.sendMessage({ action: 'stateChanged' }).catch(() => { });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'pomodoro-alarm') {
    triggerTimeUp();
  }
});

chrome.runtime.onMessage.addListener((request: any, _sender: any, sendResponse: any) => {
  if (request.action === 'getState') {
    getState().then(sendResponse);
    return true; // keeps the message channel open for async response
  }

  if (request.action === 'toggleTimer') {
    getState().then(s => s.isRunning ? pauseTimer() : startTimer());
  }

  if (request.action === 'resetTimer') {
    getState().then(s => pauseTimer().then(() => setState({
      mode: 'work',
      secondsLeft: s.workMinutes * 60  // uses actual saved value
    })));
  }

  if (request.action === 'updateConfig') {
    pauseTimer().then(() => setState({
      workMinutes: request.workDuration,
      breakMinutes: request.breakDuration,
      mode: 'work',
      secondsLeft: request.workDuration * 60
    }));
  }

  if (request.action === 'ping') {
    sendResponse({ status: 'alive' });
    return true;
  }
});
