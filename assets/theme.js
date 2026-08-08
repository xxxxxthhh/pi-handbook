/* 主题切换：本书默认深色（读者多在夜间翻），手动切换写入 localStorage。
   与系列前作不同——不跟随 prefers-color-scheme，深色是本书的默认态。
   本文件在 <head> 中同步引入（不加 defer），以便在首次绘制前设定 data-theme。 */
(function () {
  var KEY = 'pi-handbook-theme';

  try {
    var saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch (e) { /* 隐私模式下 localStorage 不可用，退回默认深色 */ }

  function bind() {
    var btn = document.querySelector('.theme-toggle');
    if (!btn) return;
    btn.addEventListener('click', function () {
      // 无 data-theme 属性时当前即默认深色
      var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem(KEY, next); } catch (e) { /* 忽略写入失败 */ }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
