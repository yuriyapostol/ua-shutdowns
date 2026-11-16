'use strict';

const AddressNavigation = {
  async open(address) {
    const response = await chrome.runtime.sendMessage({ type: 'open-address', addressId: address.id });
    if (!response?.ok) throw new Error(response?.error || 'Не вдалося відкрити графік.');
  },
  key: tabId => `address-for-tab:${tabId}`,
  async forTab(tabId, url, legacyAddressId = null) {
    const region = DtekSites.forUrl(url);
    if (!region) return null;
    const key = this.key(tabId);
    let selection = (await chrome.storage.session.get(key))[key];
    if (!selection && typeof legacyAddressId === 'string') {
      selection = { id: legacyAddressId, region: region.id };
      await chrome.storage.session.set({ [key]: selection });
    }
    return AddressSettings.forPage(url, selection?.region === region.id ? selection.id : null);
  },
  async forget(tabId) {
    await chrome.storage.session.remove(this.key(tabId));
  },
  async navigate(address) {
    const region = DtekSites.get(address.region);
    if (!region) throw new Error('Спочатку оберіть регіон для цієї адреси.');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const reuse = tab?.id != null && DtekSites.forUrl(tab.url);
    // Initialize state before loading DTEK, so the content script cannot read
    // a default address while a newly created tab's selection is still saving.
    const targetTab = reuse ? tab : await chrome.tabs.create({ url: 'about:blank' });
    const key = this.key(targetTab.id);
    let previous;
    let stored = false;
    try {
      previous = (await chrome.storage.session.get(key))[key];
      await chrome.storage.session.set({ [key]: { id: address.id, region: region.id } });
      stored = true;
      const current = reuse ? new URL(tab.url) : null;
      const target = new URL(region.url);
      const sameDocument = current && current.origin === target.origin &&
        current.pathname === target.pathname && current.search === target.search;
      // Reload even when an old fragment is present: changing only a fragment
      // would not restart selection. The content script cleans legacy markers.
      if (sameDocument) await chrome.tabs.reload(tab.id);
      else await chrome.tabs.update(targetTab.id, { url: region.url });
    } catch (error) {
      try {
        if (stored) {
          if (previous) await chrome.storage.session.set({ [key]: previous });
          else await this.forget(targetTab.id);
        }
        if (!reuse) await chrome.tabs.remove(targetTab.id);
      } catch (cleanupError) {
        console.warn('UA Shutdowns: failed navigation cleanup stopped.', cleanupError);
      }
      throw error;
    }
  }
};
