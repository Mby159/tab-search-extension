/**
 * background.js — 协调各标签页的搜索请求
 */

// 记住上一次的搜索词和结果，供 popup 恢复用
let lastQuery = '';
let lastResults = [];

/**
 * 向指定标签页注入 content script（如果尚未注入）并发送消息
 */
async function sendToTab(tabId, message) {
  try {
    const response = await browser.tabs.sendMessage(tabId, message);
    return response;
  } catch (e) {
    // content script 可能尚未加载（如 about: 页面），静默处理
    return null;
  }
}

/**
 * 搜索所有普通标签页
 */
async function searchAllTabs(query) {
  const tabs = await browser.tabs.query({});
  const results = [];

  const promises = tabs.map(async (tab) => {
    // 跳过特殊页面（about:, moz-extension: 等）
    if (!tab.url || !tab.url.startsWith('http')) return;

    const response = await sendToTab(tab.id, { action: 'search', query });
    if (response && response.count > 0) {
      results.push({
        tabId: tab.id,
        title: tab.title || tab.url,
        url: tab.url,
        favicon: tab.favIconUrl || '',
        count: response.count,
        snippets: response.snippets.slice(0, 5) // 每个标签最多显示5条摘要
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
  const tabs = await browser.tabs.query({});
  const promises = tabs
    .filter(tab => tab.url && tab.url.startsWith('http'))
    .map(tab => sendToTab(tab.id, { action: 'clear' }));
  await Promise.all(promises);
}

// 监听来自 popup 的消息
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'searchAll') {
    lastQuery = message.query; // 记住搜索词
    searchAllTabs(message.query).then(results => {
      lastResults = results; // 缓存结果
      sendResponse({ results });
    });
    return true; // 保持通道开放
  }

  if (message.action === 'getLastQuery') {
    sendResponse({ query: lastQuery, results: lastResults });
    return true;
  }

  if (message.action === 'clearAll') {
    lastQuery = ''; // 清除时也重置
    lastResults = [];
    clearAllHighlights().then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message.action === 'focusTab') {
    // 切换到指定标签页并滚动到第一个高亮
    browser.tabs.update(message.tabId, { active: true }).then(() => {
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

  if (message.action === 'scrollToIndex') {
    // 切换到目标标签页，然后跳转到指定 mark 索引
    browser.tabs.update(message.tabId, { active: true }).then(() => {
      sendToTab(message.tabId, { action: 'scrollToIndex', index: message.index }).then(resp => {
        sendResponse(resp || { ok: false });
      });
    });
    return true;
  }

  if (message.action === 'getHighlightInfo') {
    // 查询指定标签页的当前高亮信息
    sendToTab(message.tabId, { action: 'getHighlightInfo' }).then(resp => {
      sendResponse(resp || { ok: false });
    });
    return true;
  }
});

