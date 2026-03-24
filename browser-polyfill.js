/**
 * browser-polyfill.js
 * 让插件同时兼容 Firefox (browser.*) 和 Chrome/Edge/基于Chromium的浏览器 (chrome.*)
 * 原理：在 Chrome 环境下把 chrome.* Promise化，挂到 window.browser
 */
(function () {
  if (typeof globalThis.browser !== 'undefined') {
    // Firefox 原生支持 browser.*，直接用
    return;
  }

  if (typeof globalThis.chrome === 'undefined') {
    // 非浏览器扩展环境，忽略
    return;
  }

  /**
   * 将 chrome.* 回调风格 API 包装为 Promise
   */
  function wrap(api) {
    if (!api) return api;
    return new Proxy(api, {
      get(target, prop) {
        const val = target[prop];
        if (typeof val === 'function') {
          return function (...args) {
            // 如果最后一个参数已经是回调，直接透传
            if (typeof args[args.length - 1] === 'function') {
              return val.apply(target, args);
            }
            return new Promise((resolve, reject) => {
              val.apply(target, [
                ...args,
                (result) => {
                  if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                  } else {
                    resolve(result);
                  }
                },
              ]);
            });
          };
        }
        if (typeof val === 'object' && val !== null) {
          return wrap(val);
        }
        return val;
      },
    });
  }

  globalThis.browser = wrap(chrome);
})();
