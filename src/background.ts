type Mode = "work" | "break";

interface State {
  workMinutes: number;
  breakMinutes: number;
  mode: Mode;
  isRunning: boolean;
  endTime: number | null; // timestamp (ms) when the timer finishes, only while running
  remainingMs: number; // time left while paused/idle
}

const ALARM = "pomodoro-alarm";

const DEFAULT_STATE: State = {
  workMinutes: 25,
  breakMinutes: 5,
  mode: "work",
  isRunning: false,
  endTime: null,
  remainingMs: 25 * 60 * 1000,
};

async function getState(): Promise<State> {
  return (await chrome.storage.local.get(DEFAULT_STATE)) as State;
}

async function setState(partial: Partial<State>) {
  await chrome.storage.local.set(partial);
}

async function playAlarmSound() {
  const existing = await chrome.offscreen.hasDocument();
  if (!existing) {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: "Play alarm sound when timer ends",
    });
  }
  chrome.runtime.sendMessage({ action: "playAlarm" });
}

async function startTimer() {
  const s = await getState();
  if (s.isRunning) return;
  const endTime = Date.now() + s.remainingMs;
  await setState({ isRunning: true, endTime });
  await chrome.alarms.create(ALARM, { when: endTime });
}

async function pauseTimer() {
  const s = await getState();
  await chrome.alarms.clear(ALARM);
  if (!s.isRunning || s.endTime === null) {
    await setState({ isRunning: false, endTime: null });
    return;
  }
  const remainingMs = Math.max(0, s.endTime - Date.now());
  await setState({ isRunning: false, endTime: null, remainingMs });
}

async function triggerTimeUp() {
  const state = await getState();
  if (!state.isRunning) return; // already handled (guards against duplicate alarms)

  const prevMode = state.mode;
  const nextMode: Mode = prevMode === "work" ? "break" : "work";
  const nextMs =
    (nextMode === "work" ? state.workMinutes : state.breakMinutes) * 60 * 1000;

  await chrome.alarms.clear(ALARM);
  await setState({
    isRunning: false,
    endTime: null,
    mode: nextMode,
    remainingMs: nextMs,
  });
  await chrome.storage.local.set({ pendingNotification: prevMode });

  chrome.action.setBadgeText({ text: "!" });
  chrome.action.setBadgeBackgroundColor({ color: "#e63b2e" });

  await playAlarmSound();

  chrome.notifications.clear("pomodoro-done", () => {
    chrome.notifications.create(
      "pomodoro-done",
      {
        type: "basic",
        title: prevMode === "work" ? "🍅 Work session done!" : "☕ Break over!",
        message:
          prevMode === "work" ? "Time to take a break." : "Back to work!",
        iconUrl: chrome.runtime.getURL("icon.png"),
        priority: 2,
      },
      () => {
        if (chrome.runtime.lastError) {
          console.error(
            "Notification error:",
            chrome.runtime.lastError.message,
          );
        }
      },
    );
  });

  chrome.runtime
    .sendMessage({ action: "stateChanged", prevMode })
    .catch(() => {});
}

// If the browser was closed while a timer was running, finish it on next launch
async function checkExpired() {
  const s = await getState();
  if (s.isRunning && s.endTime !== null && s.endTime <= Date.now()) {
    await triggerTimeUp();
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) triggerTimeUp();
});

chrome.runtime.onStartup.addListener(checkExpired);

chrome.runtime.onMessage.addListener((request: any, _sender, sendResponse) => {
  if (request.action === "ping") {
    sendResponse({ status: "alive" });
    return true;
  }

  if (request.action === "getState") {
    getState().then(sendResponse);
    return true;
  }

  if (request.action === "toggleTimer") {
    getState()
      .then((s) => (s.isRunning ? pauseTimer() : startTimer()))
      .then(getState)
      .then(sendResponse);
    return true;
  }

  if (request.action === "resetTimer") {
    getState()
      .then((s) =>
        pauseTimer().then(() =>
          setState({ mode: "work", remainingMs: s.workMinutes * 60 * 1000 }),
        ),
      )
      .then(getState)
      .then(sendResponse);
    return true;
  }

  if (request.action === "updateConfig") {
    pauseTimer()
      .then(() =>
        setState({
          workMinutes: request.workDuration,
          breakMinutes: request.breakDuration,
          mode: "work",
          remainingMs: request.workDuration * 60 * 1000,
        }),
      )
      .then(getState)
      .then(sendResponse);
    return true;
  }
});
