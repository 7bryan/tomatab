const timerDisplay = document.getElementById("timerDisplay") as HTMLDivElement;
const timerLabel = document.getElementById("timerLabel") as HTMLDivElement;
const startStopBtn = document.getElementById(
  "startStopBtn",
) as HTMLButtonElement;
const resetBtn = document.getElementById("resetBtn") as HTMLButtonElement;
const settingsBtn = document.getElementById("settingsBtn") as HTMLButtonElement;
const settingsPanel = document.getElementById(
  "settingsPanel",
) as HTMLDivElement;
const saveSettingsBtn = document.getElementById(
  "saveSettingsBtn",
) as HTMLButtonElement;
const workDurationInput = document.getElementById(
  "workDuration",
) as HTMLInputElement;
const breakDurationInput = document.getElementById(
  "breakDuration",
) as HTMLInputElement;
const taskInput = document.getElementById("taskInput") as HTMLInputElement;
const doneOverlay = document.getElementById("doneOverlay") as HTMLDivElement;
const doneEmoji = document.getElementById("doneEmoji") as HTMLDivElement;
const doneTitle = document.getElementById("doneTitle") as HTMLDivElement;
const doneMessage = document.getElementById("doneMessage") as HTMLDivElement;
const dismissBtn = document.getElementById("dismissBtn") as HTMLButtonElement;

const INPUT_MIN_MINUTES = 1;
const INPUT_MAX_MINUTES = 120;

chrome.storage.local.get("currentTask", (result) => {
  taskInput.value = result.currentTask || "";
});

taskInput.addEventListener("input", () => {
  chrome.storage.local.set({ currentTask: taskInput.value });
});

settingsBtn.addEventListener("click", () => {
  settingsPanel.classList.toggle("hidden");
});

dismissBtn.addEventListener("click", () => {
  doneOverlay.classList.add("hidden");
});

function showOverlay(prevMode: "work" | "break") {
  if (prevMode === "work") {
    doneEmoji.textContent = "🍅";
    doneTitle.textContent = "Work session done!";
    doneMessage.textContent = "Time to take a break.";
  } else {
    doneEmoji.textContent = "☕";
    doneTitle.textContent = "Break over!";
    doneMessage.textContent = "Back to work!";
  }
  doneOverlay.classList.remove("hidden");
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function clampInput(raw: string, fallback: number): number {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(INPUT_MAX_MINUTES, Math.max(INPUT_MIN_MINUTES, n));
}

async function sendMessage(msg: object): Promise<any> {
  for (let i = 0; i < 3; i++) {
    try {
      return await chrome.runtime.sendMessage(msg);
    } catch {
      if (i < 2) await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw new Error("Could not reach background service worker");
}

let currentState: any = null;
let tickHandle: number | null = null;

function getRemainingSeconds(state: any): number {
  const ms =
    state.isRunning && state.endTime
      ? Math.max(0, state.endTime - Date.now())
      : state.remainingMs;
  return Math.ceil(ms / 1000);
}

function renderTime() {
  if (currentState) {
    timerDisplay.textContent = formatTime(getRemainingSeconds(currentState));
  }
}

function syncTicker() {
  const running = Boolean(currentState?.isRunning);
  if (running && tickHandle === null) {
    tickHandle = window.setInterval(renderTime, 250);
  } else if (!running && tickHandle !== null) {
    window.clearInterval(tickHandle);
    tickHandle = null;
  }
}

function applyState(state: any) {
  currentState = state;
  renderTime();
  syncTicker();

  timerLabel.textContent =
    state.mode === "work" ? "Work Session" : "Break Time";

  workDurationInput.value = String(state.workMinutes);
  breakDurationInput.value = String(state.breakMinutes);

  timerLabel.classList.toggle("text-slate-400", state.mode !== "break");
  timerLabel.classList.toggle("text-emerald-400", state.mode === "break");

  startStopBtn.textContent = state.isRunning ? "Pause" : "Start";
  startStopBtn.classList.toggle("bg-brand-primary", !state.isRunning);
  startStopBtn.classList.toggle("bg-amber-600", state.isRunning);
}

async function updateUI() {
  try {
    const state = await sendMessage({ action: "getState" });
    applyState(state);
  } catch (err) {
    console.error("Popup disconnected from background.", err);
  }
}

startStopBtn.addEventListener("click", async () => {
  try {
    const state = await sendMessage({ action: "toggleTimer" });
    applyState(state);
  } catch {
    await updateUI();
  }
});

resetBtn.addEventListener("click", async () => {
  doneOverlay.classList.add("hidden");
  try {
    const state = await sendMessage({ action: "resetTimer" });
    applyState(state);
  } catch {
    await updateUI();
  }
});

saveSettingsBtn.addEventListener("click", async () => {
  const workMins = clampInput(
    workDurationInput.value,
    currentState?.workMinutes ?? 25,
  );
  const breakMins = clampInput(
    breakDurationInput.value,
    currentState?.breakMinutes ?? 5,
  );
  workDurationInput.value = String(workMins);
  breakDurationInput.value = String(breakMins);

  try {
    const state = await sendMessage({
      action: "updateConfig",
      workDuration: workMins,
      breakDuration: breakMins,
    });
    applyState(state);
  } catch {
    await updateUI();
  }

  settingsPanel.classList.add("hidden");
});

chrome.runtime.onMessage.addListener((message: any) => {
  if (message.action === "stateChanged") {
    chrome.storage.local.remove("pendingNotification");
    showOverlay(message.prevMode);
    updateUI();
  }
});

(async () => {
  chrome.action.setBadgeText({ text: "" });
  try {
    await chrome.runtime.sendMessage({ action: "ping" });
  } catch {}

  chrome.storage.local.get("pendingNotification", (result) => {
    if (result.pendingNotification) {
      chrome.storage.local.remove("pendingNotification");
      showOverlay(result.pendingNotification);
    }
  });

  updateUI();
})();
