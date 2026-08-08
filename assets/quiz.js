/* 「30 秒识别模式」自测组件。
   渐进增强：题目本体是 <button> 选项 + 一个 <details> 答案块。
   没有 JS 时选项按钮点了没反应，但 <details> 仍可展开看答案；打印同理。 */
(function () {
  function init() {
    document.querySelectorAll('.q').forEach(function (q) {
      var answer = q.getAttribute('data-answer');
      var box = q.querySelector('details');
      q.querySelectorAll('.opt').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var right = btn.getAttribute('data-ch') === answer;
          // 每题只结算一次视觉状态：先清空同题其它按钮的旧结果
          q.querySelectorAll('.opt').forEach(function (b) {
            b.classList.remove('right', 'wrong');
            if (b.getAttribute('data-ch') === answer) b.classList.add('right');
          });
          if (!right) btn.classList.add('wrong');
          if (box) box.open = true;
        });
      });
    });

    document.querySelectorAll('.quiz').forEach(function (quiz) {
      var items = quiz.querySelectorAll('details');
      if (items.length < 2) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quiz-ctl';
      btn.textContent = '展开全部答案';
      btn.addEventListener('click', function () {
        var expand = btn.textContent === '展开全部答案';
        items.forEach(function (d) { d.open = expand; });
        btn.textContent = expand ? '收起全部答案' : '展开全部答案';
      });
      quiz.insertBefore(btn, quiz.firstChild);
    });
  }

  // 打印时展开全部答案，打印结束后恢复原状。
  // 不能只靠 CSS：关闭状态的 <details> 由 UA 在内容槽层面隐藏，
  // 对其子元素设 display 无法可靠覆盖，必须真的把 open 打开。
  window.addEventListener('beforeprint', function () {
    document.querySelectorAll('.q details').forEach(function (d) {
      if (!d.open) { d.dataset.wasClosed = '1'; d.open = true; }
    });
  });
  window.addEventListener('afterprint', function () {
    document.querySelectorAll('.q details[data-was-closed]').forEach(function (d) {
      d.open = false;
      delete d.dataset.wasClosed;
    });
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
