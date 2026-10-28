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
      await chrome.tabs.update(tab.id, { url: target.href });
      // Changing a fragment does not reinject a content script. Reload only when
      // the navigation stays in the same document, including repeated clicks.
      if (current.origin === target.origin && current.pathname === target.pathname && current.search === target.search) {
        await chrome.tabs.reload(tab.id);
      }
    } else {
      await chrome.tabs.create({ url: target.href });
    }
  }
};
