const alarmAudio = new Audio(chrome.runtime.getURL("alarm.mp3"));
alarmAudio.volume = 0.7;

function reportFinished() {
  chrome.runtime.sendMessage({ action: "alarmFinished" }).catch(() => {});
}

alarmAudio.addEventListener("ended", reportFinished);
alarmAudio.addEventListener("error", reportFinished);
alarmAudio.play().catch(reportFinished);
