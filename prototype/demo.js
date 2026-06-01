const text = {
  discover: "\u53d1\u73b0",
  search: "\u641c\u7d22",
  toplist: "\u699c\u5355",
  library: "\u6211\u7684",
  settings: "\u8bbe\u7f6e",
  daily: "\u6bcf\u65e5\u63a8\u8350",
  tonight: "\u4eca\u665a\u4ece\u534e\u8bed\u6162\u6b4c\u5f00\u59cb",
  playDaily: "\u64ad\u653e\u63a8\u8350",
  recommendPlaylists: "\u63a8\u8350\u6b4c\u5355",
  addToPlaylist: "\u52a0\u5165\u6b4c\u5355",
  douyinRank: "\u6296\u97f3\u6392\u884c\u699c",
  nightWalk: "\u591c\u665a\u6563\u6b65\u6b4c\u5355",
  newSongs: "\u65b0\u6b4c\u9996\u53d1",
  songUnit: "\u9996",
  recent: "\u6700\u8fd1\u64ad\u653e",
  swipeDelete: "\u5de6\u6ed1\u5220\u9664",
  delete: "\u5220\u9664",
  yinTianLive: "\u9634\u5929 (Live)",
  yinTian: "\u9634\u5929",
  moWenWei: "\u83ab\u6587\u851a",
  huiWei: "\u56de\u851a",
  glass: "\u73bb\u7483",
  haiYuNi: "\u6d77\u5c7f\u4f60",
  hot: "\u70ed\u641c",
  jay: "\u5468\u6770\u4f26",
  qingTian: "\u6674\u5929",
  daoXiang: "\u7a3b\u9999",
  suggestions: "\u5efa\u8bae",
  searchSuggestion: "\u641c\u7d22\u5efa\u8bae",
  popularSongs: "\u70ed\u95e8\u5355\u66f2",
  neteaseRising: "\u7f51\u6613\u4e91\u98d9\u5347\u699c",
  kuwoHot: "\u9177\u6211\u70ed\u6b4c\u699c",
  kuwoNew: "\u9177\u6211\u65b0\u6b4c\u699c",
  chineseRank: "\u534e\u8bed\u699c",
  westernRank: "\u6b27\u7f8e\u699c",
  create: "\u65b0\u5efa",
  favoriteSongs: "\u6536\u85cf\u6b4c\u66f2",
  longPressRename: "\u957f\u6309\u53ef\u6539\u540d",
  defaultQuality: "\u9ed8\u8ba4\u97f3\u8d28",
  wordLyric: "\u9010\u5b57\u6b4c\u8bcd",
  activeProvider: "\u5f53\u524d Provider",
  netease: "\u7f51\u6613\u4e91",
  previousLyric: "\u4e0a\u4e00\u53e5\u6b4c\u8bcd",
  currentLyric: "\u5f53\u524d\u53e5\u9010\u5b57\u9ad8\u4eae",
  nextLyric: "\u4e0b\u4e00\u53e5\u6b4c\u8bcd",
  source: "\u6e90",
  quality: "\u97f3\u8d28",
  chineseSlow: "\u534e\u8bed\u6162\u6b4c",
  playlistActions: "\u6b4c\u5355\u64cd\u4f5c",
  name: "\u540d\u79f0",
  saveName: "\u4fdd\u5b58\u540d\u79f0",
  deletedUndo: "\u5df2\u5220\u9664\uff0c\u53ef\u64a4\u9500",
};

document.querySelectorAll('[data-text]').forEach((node) => {
  node.textContent = text[node.dataset.text] ?? node.textContent;
});
document.querySelectorAll('[data-value]').forEach((node) => {
  node.value = text[node.dataset.value] ?? node.value;
});

const screens = Array.from(document.querySelectorAll('[data-screen]'));
const tabs = Array.from(document.querySelectorAll('[data-tab]'));
const player = document.querySelector('.full-player');
const sheet = document.querySelector('.bottom-sheet');
const actionSheet = document.querySelector('.action-sheet');
const toast = document.querySelector('.toast');

function showScreen(name) {
  screens.forEach((screen) => {
    screen.classList.toggle('active', screen.dataset.screen === name);
  });
  tabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === name);
  });
}

function openPanel(panel) {
  panel?.classList.add('open');
}

function closePanel(panel) {
  panel?.classList.remove('open');
}

function flashToast() {
  toast?.classList.add('show');
  window.clearTimeout(window.__toastTimer);
  window.__toastTimer = window.setTimeout(() => toast?.classList.remove('show'), 1800);
}

tabs.forEach((tab) => tab.addEventListener('click', () => showScreen(tab.dataset.tab)));
document.querySelectorAll('[data-open-player]').forEach((button) => button.addEventListener('click', () => openPanel(player)));
document.querySelector('[data-close-player]')?.addEventListener('click', () => closePanel(player));
document.querySelectorAll('[data-open-sheet]').forEach((button) => button.addEventListener('click', () => openPanel(sheet)));
document.querySelector('[data-close-sheet]')?.addEventListener('click', () => closePanel(sheet));
document.querySelectorAll('[data-longpress]').forEach((card) => {
  let timer = 0;
  card.addEventListener('pointerdown', () => {
    timer = window.setTimeout(() => openPanel(actionSheet), 520);
  });
  card.addEventListener('pointerup', () => window.clearTimeout(timer));
  card.addEventListener('pointerleave', () => window.clearTimeout(timer));
});
document.querySelector('[data-close-action]')?.addEventListener('click', () => closePanel(actionSheet));
document.querySelectorAll('[data-swipe-row]').forEach((row) => {
  let startX = 0;
  let currentX = 0;
  let dragging = false;
  const track = row.querySelector('.track-row');
  row.addEventListener('pointerdown', (event) => {
    dragging = true;
    startX = event.clientX;
    currentX = 0;
  });
  row.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    currentX = Math.min(0, event.clientX - startX);
    if (Math.abs(currentX) > 18) {
      track.style.transform = `translateX(${currentX}px)`;
    }
  });
  row.addEventListener('pointerup', () => {
    if (!dragging) return;
    dragging = false;
    if (Math.abs(currentX) > 120) {
      track.style.transform = 'translateX(-88px)';
      flashToast();
      return;
    }
    track.style.transform = 'translateX(0)';
  });
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closePanel(player);
    closePanel(sheet);
    closePanel(actionSheet);
  }
});

showScreen('discover');
