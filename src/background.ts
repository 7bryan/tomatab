type Mode = "work" | "break";

interface State {
  workMinutes: number;
  breakMinutes: number;
  mode: Mode;
  isRunning: boolean;
  endTime: number | null;
  remainingMs: number;
}

const ALARM = "pomodoro-alarm";
const NOTIFICATION_ID = "pomodoro-done";
const MIN_MINUTES = 1;
const MAX_MINUTES = 120;

const DEFAULT_STATE: State = {
  workMinutes: 25,
  breakMinutes: 5,
  mode: "work",
  isRunning: false,
  endTime: null,
  remainingMs: 25 * 60 * 1000,
};

function clampMinutes(value: unknown, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, n));
}

function sessionMs(
  durations: Pick<State, "workMinutes" | "breakMinutes">,
  mode: Mode,
): number {
  const minutes =
    mode === "work" ? durations.workMinutes : durations.breakMinutes;
  return minutes * 60 * 1000;
}

async function getState(): Promise<State> {
  return (await chrome.storage.local.get(DEFAULT_STATE)) as State;
}

async function setState(partial: Partial<State>) {
  await chrome.storage.local.set(partial);
}

async function closeAlarmDocument() {
  try {
    if (await chrome.offscreen.hasDocument()) {
      await chrome.offscreen.closeDocument();
    }
  } catch {}
}

async function playAlarmSound() {
  try {
    await closeAlarmDocument();
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
      justification: "Play alarm sound when timer ends",
    });
  } catch (err) {
    console.error("Could not play alarm sound:", err);
  }
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

async function resetTimer() {
  const s = await getState();
  await pauseTimer();
  await setState({ mode: "work", remainingMs: sessionMs(s, "work") });
  await chrome.storage.local.remove("pendingNotification");
  await chrome.action.setBadgeText({ text: "" });
  await closeAlarmDocument();
}

async function updateConfig(workInput: unknown, breakInput: unknown) {
  const s = await getState();
  const workMinutes = clampMinutes(workInput, s.workMinutes);
  const breakMinutes = clampMinutes(breakInput, s.breakMinutes);

  const untouched = !s.isRunning && s.remainingMs === sessionMs(s, s.mode);

  const update: Partial<State> = { workMinutes, breakMinutes };
  if (untouched) {
    update.remainingMs = sessionMs({ workMinutes, breakMinutes }, s.mode);
  }
  await setState(update);
}

let finishing = false;

async function triggerTimeUp() {
  if (finishing) return;
  finishing = true;
  try {
    const state = await getState();
    if (!state.isRunning) return;

    const prevMode = state.mode;
    const nextMode: Mode = prevMode === "work" ? "break" : "work";

    await chrome.alarms.clear(ALARM);
    await setState({
      isRunning: false,
      endTime: null,
      mode: nextMode,
      remainingMs: sessionMs(state, nextMode),
    });
    await chrome.storage.local.set({ pendingNotification: prevMode });

    chrome.action.setBadgeText({ text: "!" });
    chrome.action.setBadgeBackgroundColor({ color: "#e63b2e" });

    await playAlarmSound();

    chrome.notifications.clear(NOTIFICATION_ID, () => {
      chrome.notifications.create(
        NOTIFICATION_ID,
        {
          type: "basic",
          title:
            prevMode === "work" ? "🍅 Work session done!" : "☕ Break over!",
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
  } finally {
    finishing = false;
  }
}

async function recoverTimer() {
  const s = await getState();
  if (!s.isRunning || s.endTime === null) return;

  if (s.endTime <= Date.now()) {
    await triggerTimeUp();
    return;
  }

  const alarm = await chrome.alarms.get(ALARM);
  if (!alarm) {
    await chrome.alarms.create(ALARM, { when: s.endTime });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) triggerTimeUp();
});

chrome.runtime.onStartup.addListener(recoverTimer);

chrome.runtime.onMessage.addListener((request: any, _sender, sendResponse) => {
  if (request.action === "ping") {
    sendResponse({ status: "alive" });
    return true;
  }

  if (request.action === "alarmFinished") {
    closeAlarmDocument();
    return false;
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
    resetTimer().then(getState).then(sendResponse);
    return true;
  }

  if (request.action === "updateConfig") {
    updateConfig(request.workDuration, request.breakDuration)
      .then(getState)
      .then(sendResponse);
    return true;
  }
});

recoverTimer().catch(console.error);
