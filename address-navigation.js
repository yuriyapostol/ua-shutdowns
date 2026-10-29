'use strict';

const AddressNavigation = {
  async open(address) {
    const region = DtekSites.get(address.region);
    if (!region) throw new Error('Спочатку оберіть регіон для цієї адреси.');
    const target = new URL(region.url);
    // Keep address text out of the URL; the random local ID stays in the fragment.
    target.hash = new URLSearchParams({ 'ua-shutdowns-address': address.id }).toString();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentRegion = DtekSites.forUrl(tab?.url);
    if (tab?.id != null && currentRegion) {
      const current = new URL(tab.url);
      const sameDocument = current.origin === target.origin && current.pathname === target.pathname && current.search === target.search;
      if (sameDocument && current.href !== target.href) {
        // tabs.update can resolve while the tab still has the previous fragment.
        // Reload only after Chrome confirms that this exact URL has committed.
        await new Promise((resolve, reject) => {
          let updated = false;
          let committed = false;
          function finish(error) {
            if (!error && (!updated || !committed)) return;
            clearTimeout(timer);
            chrome.tabs.onUpdated.removeListener(onUpdated);
            if (error) reject(error); else resolve();
          }
          function onUpdated(id, change) {
            if (id === tab.id && change.url === target.href) {
              committed = true;
              finish();
            }
          }
          const timer = setTimeout(() => finish(new Error('Не вдалося підтвердити перехід до вибраної адреси.')), 5000);
          chrome.tabs.onUpdated.addListener(onUpdated);
          chrome.tabs.update(tab.id, { url: target.href }).then(() => {
            updated = true;
            finish();
          }, finish);
        });
      } else if (!sameDocument) {
        await chrome.tabs.update(tab.id, { url: target.href });
      }
      // A fragment change does not reinject the content script. An unchanged
      // URL can be reloaded immediately; it already identifies the right address.
      if (sameDocument) {
        await chrome.tabs.reload(tab.id);
      }
    } else {
      await chrome.tabs.create({ url: target.href });
    }
  }
};
