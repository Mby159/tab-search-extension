/**
 * popup.js — 搜索弹窗逻辑
 */

const searchInput = document.getElementById('searchInput');
const clearBtn = document.getElementById('clearBtn');
const resultsEl = document.getElementById('results');
const statusBar = document.getElementById('statusBar');
const statusText = document.getElementById('statusText');

let debounceTimer = null;
let lastQuery = '';
let searchResults = []; // 保存搜索结果
let selectedTabIndex = -1; // 当前选中的标签索引

// ── 工具函数 ──────────────────────────────────────────────

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 在摘要文本中标记高亮（大小写不敏感）
 */
function highlightSnippet(snippet, query) {
  const escaped = escapeHtml(snippet);
  if (!query) return escaped;
  const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
  return escaped.replace(regex, '<mark>$1</mark>');
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function setStatus(text, type) {
  statusBar.className = 'status-bar' + (type ? ` ${type}` : '');
  statusText.textContent = text;
}

// ── 搜索逻辑 ──────────────────────────────────────────────

function showSpinner() {
  statusBar.className = 'status-bar';
  statusText.innerHTML = ''; // 清空
  const spinner = document.createElement('span');
  spinner.className = 'spinner';
  statusText.appendChild(spinner);
  statusText.appendChild(document.createTextNode(' 正在搜索…'));
}

async function doSearch(query) {
  if (!query || query.trim() === '') {
    clearResults();
    setStatus('输入关键词开始搜索');
    return;
  }

  lastQuery = query;
  showSpinner();

  try {
    const response = await browser.runtime.sendMessage({
      action: 'searchAll',
      query: query.trim()
    });

    if (query !== lastQuery) return; // 已被新查询覆盖

    searchResults = response.results || [];
    selectedTabIndex = searchResults.length > 0 ? 0 : -1;
    renderResults(searchResults, query.trim());
  } catch (e) {
    setStatus('搜索出错：' + e.message, 'no-results');
  }
}

function clearResults() {
  resultsEl.innerHTML = '';
  searchResults = [];
  selectedTabIndex = -1;
}

function createElement(tag, className, attrs = {}) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

function renderResults(results, query) {
  clearResults();
  searchResults = results;

  if (!results || results.length === 0) {
    setStatus('未找到 "' + escapeHtml(query) + '" 的匹配结果', 'no-results');
    const emptyDiv = createElement('div', 'empty-state');
    const iconDiv = createElement('div', 'icon');
    iconDiv.textContent = '🔎';
    const p = document.createElement('p');
    p.textContent = '在所有标签页中未找到匹配内容';
    emptyDiv.appendChild(iconDiv);
    emptyDiv.appendChild(p);
    resultsEl.appendChild(emptyDiv);
    return;
  }

  const totalCount = results.reduce((sum, r) => sum + r.count, 0);
  statusBar.className = 'status-bar has-results';
  statusText.innerHTML = '';
  statusText.appendChild(document.createTextNode('在 '));
  const strong1 = document.createElement('strong');
  strong1.textContent = results.length;
  statusText.appendChild(strong1);
  statusText.appendChild(document.createTextNode(' 个标签页中找到 '));
  const strong2 = document.createElement('strong');
  strong2.textContent = totalCount;
  statusText.appendChild(strong2);
  statusText.appendChild(document.createTextNode(' 处匹配'));

  results.forEach((tab, index) => {
    const card = createElement('div', 'tab-card' + (index === 0 ? ' expanded' : ''));
    card.dataset.index = String(index);
    card.dataset.tabId = String(tab.tabId);

    // Header
    const header = createElement('div', 'tab-header');
    
    // Favicon
    if (tab.favicon) {
      const img = createElement('img', 'tab-favicon', { src: tab.favicon, alt: '' });
      img.onerror = function() {
        this.style.display = 'none';
        this.nextElementSibling.style.display = 'flex';
      };
      const placeholder = createElement('div', 'tab-favicon-placeholder');
      placeholder.style.display = 'none';
      placeholder.textContent = '🌐';
      header.appendChild(img);
      header.appendChild(placeholder);
    } else {
      const placeholder = createElement('div', 'tab-favicon-placeholder');
      placeholder.textContent = '🌐';
      header.appendChild(placeholder);
    }

    // Title
    const titleSpan = createElement('span', 'tab-title', { title: tab.title });
    titleSpan.textContent = tab.title;
    header.appendChild(titleSpan);

    // Count
    const countSpan = createElement('span', 'tab-count');
    countSpan.textContent = String(tab.count);
    header.appendChild(countSpan);

    // Toggle
    const toggleSpan = createElement('span', 'tab-toggle');
    toggleSpan.textContent = '▼';
    header.appendChild(toggleSpan);

    card.appendChild(header);

    // Snippets container
    const snippetsDiv = createElement('div', 'tab-snippets');

    // URL
    const urlDiv = createElement('div', 'tab-url', { title: tab.url });
    urlDiv.textContent = tab.url;
    snippetsDiv.appendChild(urlDiv);

    // Snippets
    tab.snippets.forEach(s => {
      const snippetDiv = createElement('div', 'snippet');
      snippetDiv.textContent = s;
      snippetsDiv.appendChild(snippetDiv);
    });

    // Nav buttons
    const navDiv = createElement('div', 'nav-buttons');
    const prevBtn = createElement('button', 'nav-btn nav-prev', { 'data-tab-id': String(tab.tabId), title: '上一个匹配 (Shift+Enter)' });
    prevBtn.textContent = '◀ 上一个';
    const indicator = createElement('span', 'nav-indicator');
    indicator.id = 'indicator-' + tab.tabId;
    indicator.textContent = '1 / ' + tab.count;
    const nextBtn = createElement('button', 'nav-btn nav-next', { 'data-tab-id': String(tab.tabId), title: '下一个匹配 (Enter)' });
    nextBtn.textContent = '下一个 ▶';
    navDiv.appendChild(prevBtn);
    navDiv.appendChild(indicator);
    navDiv.appendChild(nextBtn);
    snippetsDiv.appendChild(navDiv);

    // Focus button
    const focusBtn = createElement('button', 'focus-btn', { 'data-tab-id': String(tab.tabId) });
    focusBtn.textContent = '→ 跳转到该标签页';
    snippetsDiv.appendChild(focusBtn);

    card.appendChild(snippetsDiv);

    // Event listeners
    header.addEventListener('click', () => {
      card.classList.toggle('expanded');
      selectedTabIndex = parseInt(card.dataset.index);
      updateSelection();
    });

    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigateHighlight(tab.tabId, 'prev');
    });

    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigateHighlight(tab.tabId, 'next');
    });

    focusBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      focusTab(tab.tabId);
    });

    resultsEl.appendChild(card);
  });

  selectedTabIndex = 0;
  updateSelection();
}

/**
 * 更新选中状态样式
 */
function updateSelection() {
  document.querySelectorAll('.tab-card').forEach((card, index) => {
    if (index === selectedTabIndex) {
      card.style.borderColor = '#89b4fa';
      card.style.background = '#2a2d45';
    } else {
      card.style.borderColor = '#313244';
      card.style.background = '#24273a';
    }
  });
}

/**
 * 导航到上一个/下一个高亮
 */
async function navigateHighlight(tabId, direction) {
  const action = direction === 'next' ? 'scrollToNext' : 'scrollToPrev';
  try {
    const response = await browser.runtime.sendMessage({ action, tabId });
    if (response && response.ok) {
      // 更新指示器
      const indicator = document.getElementById(`indicator-${tabId}`);
      if (indicator && response.total > 0) {
        indicator.textContent = `${response.index + 1} / ${response.total}`;
      }
      // 刷新摘要列表：只显示当前高亮附近的那一条
      if (response.snippet !== undefined) {
        const card = document.querySelector(`.tab-card[data-tab-id="${tabId}"]`);
        if (card) {
          const snippetsContainer = card.querySelectorAll('.snippet');
          // 移除旧的所有 snippet
          snippetsContainer.forEach(el => el.remove());
          // 在 URL div 后插入新 snippet
          const urlDiv = card.querySelector('.tab-url');
          const newSnippet = document.createElement('div');
          newSnippet.className = 'snippet';
          newSnippet.textContent = response.snippet || '';
          if (urlDiv && urlDiv.nextSibling) {
            urlDiv.parentNode.insertBefore(newSnippet, urlDiv.nextSibling);
          } else if (urlDiv) {
            urlDiv.parentNode.appendChild(newSnippet);
          }
        }
      }
    }
  } catch (e) {
    console.error('导航失败:', e);
  }
}

/**
 * 切换到指定标签页
 */
async function focusTab(tabId) {
  try {
    await browser.runtime.sendMessage({ action: 'focusTab', tabId });
    window.close();
  } catch (e) {
    console.error('跳转失败:', e);
  }
}

// ── 清除 ──────────────────────────────────────────────────

async function clearSearch() {
  searchInput.value = '';
  lastQuery = '';
  clearResults();
  setStatus('输入关键词开始搜索');
  try {
    await browser.runtime.sendMessage({ action: 'clearAll' });
  } catch (_) {}
  searchInput.focus();
}

// ── 键盘导航 ──────────────────────────────────────────────

function handleKeyNavigation(e) {
  const cards = document.querySelectorAll('.tab-card');
  if (cards.length === 0) return;

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      selectedTabIndex = (selectedTabIndex + 1) % cards.length;
      updateSelection();
      cards[selectedTabIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      break;
    case 'ArrowUp':
      e.preventDefault();
      selectedTabIndex = selectedTabIndex <= 0 ? cards.length - 1 : selectedTabIndex - 1;
      updateSelection();
      cards[selectedTabIndex].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      break;
    case 'Enter':
      e.preventDefault();
      if (selectedTabIndex >= 0 && selectedTabIndex < cards.length) {
        const tabId = parseInt(cards[selectedTabIndex].dataset.tabId);
        if (e.shiftKey) {
          navigateHighlight(tabId, 'prev');
        } else {
          // 如果卡片未展开，先展开；否则导航到下一个
          if (!cards[selectedTabIndex].classList.contains('expanded')) {
            cards[selectedTabIndex].classList.add('expanded');
          } else {
            navigateHighlight(tabId, 'next');
          }
        }
      }
      break;
  }
}

// ── 事件绑定 ──────────────────────────────────────────────

searchInput.addEventListener('input', () => {
  clearTimeout(debounceTimer);
  const query = searchInput.value;
  if (!query.trim()) {
    clearSearch();
    return;
  }
  debounceTimer = setTimeout(() => doSearch(query), 300);
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    clearTimeout(debounceTimer);
    doSearch(searchInput.value);
  }
  if (e.key === 'Escape') {
    clearSearch();
  }
  // 在搜索框时也能用方向键导航结果
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    handleKeyNavigation(e);
  }
});

clearBtn.addEventListener('click', clearSearch);

// 结果区域键盘导航
resultsEl.addEventListener('keydown', handleKeyNavigation);

// 打开时自动聚焦
searchInput.focus();
