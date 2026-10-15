// Zapazka Lite by PN Scripts (MIT): texts older than 7 days removed every hour.
/* global ZapazkaCore */
async function cleanUp() {
  const all = await browser.storage.local.get(null);
  const old = ZapazkaCore.expired(all, Date.now(), ZapazkaCore.DEFAULTS.days);
  if (old.length) await browser.storage.local.remove(old);
  return old.length;
}

browser.runtime.onInstalled.addListener(async () => {
  browser.alarms.create('zapazka-clean', { periodInMinutes: 60 });
  await cleanUp();
});
browser.runtime.onStartup.addListener(() => {
  browser.alarms.create('zapazka-clean', { periodInMinutes: 60 });
  cleanUp();
});
browser.alarms.onAlarm.addListener((a) => { if (a.name === 'zapazka-clean') cleanUp(); });
