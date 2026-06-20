(() => {
  const localOrigin = location.origin;

  const block = (name, target) => {
    throw new Error(`${name} is disabled for non-local preview requests: ${target}`);
  };

  const getRequestUrl = (target) => {
    if (typeof target === 'string' || target instanceof URL) {
      return new URL(String(target), location.href);
    }
    if (target && typeof target === 'object' && 'url' in target) {
      return new URL(String(target.url), location.href);
    }
    return new URL(String(target), location.href);
  };

  const isAllowedLocalRequest = (target) => {
    const url = getRequestUrl(target);
    if (url.protocol === 'data:') {
      return true;
    }
    if (url.protocol === 'blob:') {
      return url.origin === localOrigin;
    }
    return url.origin === localOrigin;
  };

  const assertLocalRequest = (name, target) => {
    if (!isAllowedLocalRequest(target)) {
      block(name, target);
    }
  };

  const setBlockedGlobal = (name, value) => {
    try {
      Object.defineProperty(globalThis, name, {
        value,
        configurable: false,
        writable: false,
      });
    } catch {
      globalThis[name] = value;
    }
  };

  if (typeof globalThis.fetch === 'function') {
    const originalFetch = globalThis.fetch.bind(globalThis);
    setBlockedGlobal('fetch', (resource, init) => {
      assertLocalRequest('fetch', resource);
      return originalFetch(resource, init);
    });
  }

  if (typeof globalThis.XMLHttpRequest === 'function') {
    const OriginalXMLHttpRequest = globalThis.XMLHttpRequest;
    function GuardedXMLHttpRequest() {
      const request = new OriginalXMLHttpRequest();
      const originalOpen = request.open;
      request.open = function open(method, url, ...rest) {
        assertLocalRequest('XMLHttpRequest', url);
        return originalOpen.call(request, method, url, ...rest);
      };
      return request;
    }
    GuardedXMLHttpRequest.prototype = OriginalXMLHttpRequest.prototype;
    Object.setPrototypeOf(GuardedXMLHttpRequest, OriginalXMLHttpRequest);

    for (const key of Object.getOwnPropertyNames(OriginalXMLHttpRequest)) {
      if (key in GuardedXMLHttpRequest) {
        continue;
      }
      try {
        Object.defineProperty(GuardedXMLHttpRequest, key, Object.getOwnPropertyDescriptor(OriginalXMLHttpRequest, key));
      } catch {
        // Some browser-provided descriptors are not configurable.
      }
    }
    setBlockedGlobal('XMLHttpRequest', GuardedXMLHttpRequest);
  }

  class BlockedWebSocket {
    constructor(url) {
      block('WebSocket', url);
    }
  }

  class BlockedEventSource {
    constructor(url) {
      block('EventSource', url);
    }
  }

  setBlockedGlobal('WebSocket', BlockedWebSocket);
  setBlockedGlobal('EventSource', BlockedEventSource);

  const guardedSendBeacon = (url) => {
    assertLocalRequest('sendBeacon', url);
    return false;
  };

  if (navigator && typeof navigator === 'object') {
    try {
      Object.defineProperty(navigator, 'sendBeacon', {
        value: guardedSendBeacon,
        configurable: false,
        writable: false,
      });
    } catch {
      navigator.sendBeacon = guardedSendBeacon;
    }
  }
})();
