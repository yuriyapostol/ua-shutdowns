'use strict';

importScripts('i18n-catalogs.js', 'i18n.js', 'dtek-sites.js', 'dtek-schedule.js', 'address-settings.js', 'address-navigation.js');

// Serialize detections from multiple modals/tabs, including while openPopup waits.
let offerQueue = Promise.resolve();
let navigationQueue = Promise.resolve();

async function offerPopupClosing(sender) {
  // Recheck at handling time in case the user switched tabs after detection.
  const tab = await chrome.tabs.get(sender.tab.id);
  const window = await chrome.windows.get(tab.windowId);
  if (!tab.active || !window.focused) return;
  await AddressSettings.recordPopupDetection();
  if (!await AddressSettings.shouldOfferPopupClosing()) return;
  const { popupOfferAutoOpened } = await chrome.storage.local.get('popupOfferAutoOpened');
  if (popupOfferAutoOpened === true) return;

  // A background tab must not interrupt a different page or browser window.
  const currentTab = await chrome.tabs.get(sender.tab.id);
  const currentWindow = await chrome.windows.get(currentTab.windowId);
  if (!currentTab.active || !currentWindow.focused) return;
  await chrome.action.openPopup({ windowId: currentTab.windowId });
  await chrome.storage.local.set({ popupOfferAutoOpened: true });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'open-address' && sender.url === chrome.runtime.getURL('popup.html')) {
    navigationQueue = navigationQueue.then(async () => {
      await I18n.init();
      const address = (await AddressSettings.list()).find(item => item.id === message.addressId);
      if (!address) throw new Error(I18n.t('address_save_already_deleted_error'));
      await AddressNavigation.navigate(address);
      sendResponse({ ok: true });
    }).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (sender.frameId !== 0 || !sender.tab || !DtekSites.forUrl(sender.url) ||
      !new URL(sender.url).pathname.startsWith('/ua/shutdowns')) return;

  if (message?.type === 'get-page-address') {
    navigationQueue = navigationQueue.then(async () => {
      await I18n.init();
      const address = await AddressNavigation.forTab(sender.tab.id, sender.url, message.legacyAddressId);
      sendResponse({ ok: true, address });
    }).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === 'save-address-queue') {
    navigationQueue = navigationQueue.then(async () => {
      await I18n.init();
      const address = await AddressNavigation.forTab(sender.tab.id, sender.url);
      if (!address || address.id !== message.address?.id) throw new Error(I18n.t('address_navigation_tab_changed_error'));
      await AddressSettings.saveQueue(message.address, message.queue, message.schedule, message.schedules);
      sendResponse({ ok: true });
    }).catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type !== 'popup-detected') return;

  offerQueue = offerQueue.then(() => offerPopupClosing(sender)).then(() => {
    sendResponse({ ok: true });
  }).catch(error => {
    // Keep the pending offer available when Chrome cannot open the popup.
    console.warn('UA Shutdowns: popup offer could not be opened.', error);
    sendResponse({ ok: false });
  });
  return true;
});

chrome.tabs.onRemoved.addListener(tabId => {
  AddressNavigation.forget(tabId).catch(error => {
    console.warn('UA Shutdowns: closed tab state could not be removed.', error);
  });
});
