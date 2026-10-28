'use strict';

const DtekSites = (() => {
  const regions = [
    { id: 'kem', name: 'Київ', operator: 'Київські електромережі', city: 'Київ' },
    { id: 'krem', name: 'Київська область', operator: 'Київські регіональні електромережі' },
    { id: 'dnem', name: 'Дніпропетровська область', operator: 'Дніпровські електромережі' },
    { id: 'oem', name: 'Одеська область', operator: 'Одеські електромережі' },
    { id: 'dem', name: 'Донецька область', operator: 'Донецькі електромережі' }
  ].map(region => Object.freeze({ ...region, host: `dtek-${region.id}.com.ua`,
    url: `https://www.dtek-${region.id}.com.ua/ua/shutdowns` }));
  function forUrl(value) {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') return null;
      return regions.find(region => url.hostname === region.host || url.hostname === 'www.' + region.host) || null;
    } catch { return null; }
  }
  return Object.freeze({ regions: Object.freeze(regions),
    get: id => regions.find(region => region.id === id) || null, forUrl });
})();
