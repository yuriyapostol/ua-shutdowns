(function() {
  'use strict';

  let observer;
  let retryTimer;
  let revision = 0;
  let disposed = false;

  function configure(enabled) {
    observer?.disconnect();
    observer = null;
    clearTimeout(retryTimer);
    retryTimer = null;
    if (!enabled || disposed) return;

    const attempted = new WeakMap();
    function closePopups() {
      let retry = false;
      for (const modal of document.querySelectorAll('.micromodal-slide')) {
        const open = modal.classList.contains('is-open') || modal.getAttribute('aria-hidden') === 'false';
        if (!open) {
          attempted.delete(modal);
          continue;
        }
        // The modal can appear before its dismiss listener is installed. Retry
        // with a delay, without creating a loop from our own DOM mutations.
        if (Date.now() - (attempted.get(modal) ?? -Infinity) < 300) {
          retry = true;
          continue;
        }
        // Use DTEK's own dismiss handler so focus, backdrops and scrolling
        // are restored together. Never click confirmation or submit buttons.
        const close = modal.querySelector('.modal__close[data-micromodal-close]') ||
          modal.querySelector('.modal__overlay[data-micromodal-close]');
        if (close) {
          attempted.set(modal, Date.now());
          close.click();
          if (!modal.classList.contains('is-open') && modal.getAttribute('aria-hidden') !== 'false') {
            attempted.delete(modal);
          }
        }
        if (modal.classList.contains('is-open') || modal.getAttribute('aria-hidden') === 'false') retry = true;
      }
      if (retry && !retryTimer) {
        retryTimer = setTimeout(() => {
          retryTimer = null;
          closePopups();
        }, 300);
      } else if (!retry) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
    }

    observer = new MutationObserver(closePopups);
    observer.observe(document.documentElement, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: ['class', 'aria-hidden']
    });
    closePopups();
  }

  function onChanged(changes, area) {
    if (area !== 'local' || !Object.hasOwn(changes, 'autoClosePopups')) return;
    revision++;
    configure(changes.autoClosePopups.newValue === true);
  }

  chrome.storage.onChanged.addListener(onChanged);
  AddressSettings.loadPreferences().then(preferences => {
    if (revision === 0) configure(preferences.autoClosePopups);
  }).catch(error => {
    console.warn('UA Shutdowns: popup settings could not be loaded.', error);
  });

  window.addEventListener('pagehide', event => {
    if (event.persisted) return;
    disposed = true;
    observer?.disconnect();
    clearTimeout(retryTimer);
    chrome.storage.onChanged.removeListener(onChanged);
  });
})();
