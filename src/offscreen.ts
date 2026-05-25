chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'playAlarm') {
    const audio = new Audio(chrome.runtime.getURL('alarm.mp3'));
    audio.volume = 0.7;
    audio.play().catch(() => { });
  }
});
