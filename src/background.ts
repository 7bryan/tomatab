let workMinutes = 25;
let breakMinutes = 5;

let secondsLeft = workMinutes * 60;
let isRunning = false;
let mode: 'work' | 'break' = 'work';
let timerInterval: any = null;

function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  isRunning = true;

  // We use standard setInterval for real-time 1-second popup updates...
  timerInterval = setInterval(() => {
    if (secondsLeft > 0) {
      secondsLeft--;
      chrome.runtime.sendMessage({ action: 'tick', secondsLeft }).catch(() => { });
    } else {
      triggerTimeUp();
    }
  }, 1000);

  // ...And we set a secure browser Alarm so it wakes up even if the service worker goes completely idle!
  chrome.alarms.create('pomodoro-alarm', { delayInMinutes: secondsLeft / 60 });
}

function pauseTimer() {
  isRunning = false;
  if (timerInterval) clearInterval(timerInterval);
  chrome.alarms.clear('pomodoro-alarm');
}

function triggerTimeUp() {
  pauseTimer();
  const currentMode = mode;

  if (mode === 'work') {
    mode = 'break';
    secondsLeft = breakMinutes * 60;
  } else {
    mode = 'work';
    secondsLeft = workMinutes * 60;
  }

  chrome.notifications.create('pomodoro-done', {
    type: 'basic',
    title: "Time's up!",
    message: currentMode === 'work' ? 'Take a break.' : 'Back to work!',
    iconUrl: 'icon.png'
  });

  chrome.runtime.sendMessage({ action: 'stateChanged' }).catch(() => { });
}

// Watchdog fallback: Listener if the Alarm wakes the background script from sleep
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'pomodoro-alarm') {
    triggerTimeUp();
  }
});

chrome.runtime.onMessage.addListener((request: any, sender: any, sendResponse: any) => {
  switch (request.action) {
    case 'getState':
      return Promise.resolve({ secondsLeft, isRunning, mode });

    case 'toggleTimer':
      if (isRunning) pauseTimer();
      else startTimer();
      break;

    case 'resetTimer':
      pauseTimer();
      mode = 'work';
      secondsLeft = workMinutes * 60;
      break;

    case 'updateConfig':
      pauseTimer();
      workMinutes = request.workDuration;
      breakMinutes = request.breakDuration;
      mode = 'work';
      secondsLeft = workMinutes * 60;
      break;
  }
});
