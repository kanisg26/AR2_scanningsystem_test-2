// 電子小黒板（kokuban/）へのリンク。配信用の追加で、元ソース（PipeScannerWebChrome）にはない（README 参照）。
// 既存の js/・css/ には手を入れず、ヘッダーのボタン欄にボタンを1つ差し込むだけ。
(function () {
  'use strict';

  var actions = document.querySelector('#app-header .header-actions');
  if (!actions) return; // ヘッダーが見つからなければ何もしない

  var button = document.createElement('button');
  button.type = 'button';
  button.id = 'btn-kokuban';
  button.textContent = '黒板';
  button.setAttribute('aria-label', '電子小黒板へ');
  // 幅 360px でもタイトルと既存のボタンを折り返させないよう、このボタンだけ左右の余白を詰める（幅 44px＝タッチの最小）
  button.style.cssText = 'padding:0 6px;min-width:44px;white-space:nowrap;flex:none';
  actions.insertBefore(button, actions.firstChild);

  // 記録済みの点数（「(N点)」の表示から読む）。読めないときは null
  function recordedPoints() {
    var el = document.getElementById('point-count');
    var m = el ? /(\d+)\s*点/.exec(el.textContent || '') : null;
    return m ? Number(m[1]) : null;
  }

  button.addEventListener('click', function () {
    // スキャン側は「保存」を押したときだけ保存する。0 点と読めたとき以外は確認を出す
    var n = recordedPoints();
    if (n !== 0) {
      var message = n === null
        ? '「保存」を押していない記録は失われます。電子小黒板へ移動しますか？'
        : '記録済みのポイント（' + n + '点）は、「保存」を押していないと失われます。電子小黒板へ移動しますか？';
      if (!window.confirm(message)) return;
    }
    location.href = './kokuban/';
  });

  // AR（WebXR）中は出さない。main.js が AR 中はヘッダーごと隠すが、念のため AR 用の表示（#ar-overlay）も見る
  var overlay = document.getElementById('ar-overlay');
  if (overlay) {
    var sync = function () {
      button.hidden = !overlay.hidden;
    };
    sync();
    new MutationObserver(sync).observe(overlay, { attributes: true, attributeFilter: ['hidden'] });
  }
})();
