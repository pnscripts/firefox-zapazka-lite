// Zapazka Lite by PN Scripts (MIT): texts older than 7 days removed every hour.
/* global ZapazkaCore */
async function cleanUp() {
  const all = await browser.storage.local.get(null);
  const old = ZapazkaCore.expired(all, Date.now(), ZapazkaCore.DEFAULTS.days);
  const led = ZapazkaCore.ledgerExpire(all, Date.now(), ZapazkaCore.DEFAULTS.days);
  const gone = [...old, ...led.drop];
  if (gone.length) await browser.storage.local.remove(gone);
  if (Object.keys(led.keep).length) await browser.storage.local.set(led.keep);
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

// The toolbar badge: how many fields Zapazka protects on the page, or why it is not watching it.
browser.runtime.onMessage.addListener((m, sender) => {
  if (!m || m.type !== 'zapazka-badge' || !sender.tab) return undefined;
  const tabId = sender.tab.id;
  const text = m.state === 'on' ? (m.n ? String(m.n) : '') : m.state === 'paused' ? 'II' : 'off';
  browser.action.setBadgeText({ tabId, text }).catch(() => {});
  browser.action.setBadgeBackgroundColor({ tabId, color: m.state === 'on' ? '#1b7f4b' : '#5e6b7a' }).catch(() => {});
  if (browser.action.setBadgeTextColor) browser.action.setBadgeTextColor({ tabId, color: '#ffffff' }).catch(() => {});
  return undefined;
});
