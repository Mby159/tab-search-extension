/**
 * background-mv3.js — Chrome Manifest V3 Service Worker
 * 与 background.js 逻辑相同，但适配 MV3 的 service worker 环境
 * （importScripts 引入兼容层）
 */
importScripts('browser-polyfill.js');

/**
 * 向指定标签页发送消息
 */
async function sendToTab(tabId, message) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, message);
    return response;
  } catch (e) {
    return null;
  }
}

/**
 * 搜索所有普通标签页
 */
async function searchAllTabs(query) {
  const tabs = await chrome.tabs.query({});
  const results = [];

  const promises = tabs.map(async (tab) => {
    if (!tab.url || !tab.url.startsWith('http')) return;
    const response = await sendToTab(tab.id, { action: 'search', query });
    if (response && response.count > 0) {
      results.push({
        tabId: tab.id,
        title: tab.title || tab.url,
        url: tab.url,
        favicon: tab.favIconUrl || '',
        count: response.count,
        snippets: response.snippets.slice(0, 5)
      });
    }
  });

  await Promise.all(promises);
  return results;
}

/**
 * 清除所有标签页的高亮
 */
async function clearAllHighlights() {
  const tabs = await chrome.tabs.query({});
  const promises = tabs
    .filter(tab => tab.url && tab.url.startsWith('http'))
    .map(tab => sendToTab(tab.id, { action: 'clear' }));
  await Promise.all(promises);
}

// 监听来自 popup 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'searchAll') {
    searchAllTabs(message.query).then(results => sendResponse({ results }));
    return true;
  }
  if (message.action === 'clearAll') {
    clearAllHighlights().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.action === 'focusTab') {
    chrome.tabs.update(message.tabId, { active: true }).then(() => {
      sendToTab(message.tabId, { action: 'scrollToFirst' });
    });
    sendResponse({ ok: true });
    return true;
  }
  if (message.action === 'scrollToNext') {
    sendToTab(message.tabId, { action: 'scrollToNext' }).then(resp => {
      sendResponse(resp || { ok: false });
    });
    return true;
  }
  if (message.action === 'scrollToPrev') {
    sendToTab(message.tabId, { action: 'scrollToPrev' }).then(resp => {
      sendResponse(resp || { ok: false });
    });
    return true;
  }
});
