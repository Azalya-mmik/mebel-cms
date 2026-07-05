// public/chat-widget.js
// Чат с AI-консультантом: плавающая кнопка справа внизу + окно диалога.
// Подключение: <script src="/chat-widget.js" defer></script> перед </body>.
(function () {
  'use strict';

  // ── стабильный id сессии в рамках браузера ──
  var sessionId;
  try {
    sessionId = localStorage.getItem('rt_chat_sid');
    if (!sessionId) {
      sessionId = 'sid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem('rt_chat_sid', sessionId);
    }
  } catch (e) {
    sessionId = 'sid_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  }

  // ── стили ──
  var css = ''
    + '#rtChatBtn{position:fixed;right:20px;bottom:20px;width:60px;height:60px;border-radius:50%;'
    + 'background:#8B5A2B;color:#fff;border:none;cursor:pointer;font-size:26px;z-index:99998;'
    + 'box-shadow:0 4px 14px rgba(0,0,0,.25);transition:transform .15s}'
    + '#rtChatBtn:hover{transform:scale(1.07)}'
    + '#rtChatBox{position:fixed;right:20px;bottom:92px;width:340px;max-width:calc(100vw - 32px);'
    + 'height:460px;max-height:calc(100vh - 120px);background:#fff;border-radius:14px;z-index:99999;'
    + 'box-shadow:0 8px 30px rgba(0,0,0,.3);display:none;flex-direction:column;overflow:hidden;'
    + 'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}'
    + '#rtChatBox.open{display:flex}'
    + '#rtChatHead{background:#8B5A2B;color:#fff;padding:12px 16px;font-weight:600;font-size:15px;'
    + 'display:flex;justify-content:space-between;align-items:center}'
    + '#rtChatHead small{display:block;font-weight:400;font-size:12px;opacity:.85}'
    + '#rtChatClose{background:none;border:none;color:#fff;font-size:20px;cursor:pointer;line-height:1}'
    + '#rtChatLog{flex:1;overflow-y:auto;padding:12px;background:#f7f4f0}'
    + '.rtMsg{margin:6px 0;padding:9px 12px;border-radius:12px;font-size:14px;line-height:1.45;'
    + 'max-width:85%;white-space:pre-wrap;word-wrap:break-word}'
    + '.rtMsg.user{background:#8B5A2B;color:#fff;margin-left:auto;border-bottom-right-radius:4px}'
    + '.rtMsg.bot{background:#fff;color:#222;border:1px solid #e5ddd3;border-bottom-left-radius:4px}'
    + '.rtMsg.typing{color:#999;font-style:italic}'
    + '#rtChatForm{display:flex;border-top:1px solid #e5ddd3;background:#fff}'
    + '#rtChatInput{flex:1;border:none;padding:12px;font-size:14px;outline:none;resize:none;font-family:inherit}'
    + '#rtChatSend{background:none;border:none;color:#8B5A2B;font-size:20px;padding:0 14px;cursor:pointer}'
    + '#rtChatSend:disabled{opacity:.4;cursor:default}'
    + '@media(max-width:480px){#rtChatBox{right:8px;bottom:84px}}';

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ── разметка ──
  var btn = document.createElement('button');
  btn.id = 'rtChatBtn';
  btn.type = 'button';
  btn.title = 'Чат с консультантом';
  btn.textContent = '💬';

  var box = document.createElement('div');
  box.id = 'rtChatBox';
  box.innerHTML = ''
    + '<div id="rtChatHead"><div>R&T Мебель<small>AI-консультант онлайн</small></div>'
    + '<button id="rtChatClose" type="button" aria-label="Закрыть">×</button></div>'
    + '<div id="rtChatLog"></div>'
    + '<form id="rtChatForm"><textarea id="rtChatInput" rows="1" placeholder="Напишите вопрос..." maxlength="1000"></textarea>'
    + '<button id="rtChatSend" type="submit" aria-label="Отправить">➤</button></form>';

  document.body.appendChild(btn);
  document.body.appendChild(box);

  var log = box.querySelector('#rtChatLog');
  var form = box.querySelector('#rtChatForm');
  var input = box.querySelector('#rtChatInput');
  var send = box.querySelector('#rtChatSend');
  var greeted = false;
  var busy = false;

  function addMsg(text, who) {
    var el = document.createElement('div');
    el.className = 'rtMsg ' + who;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  btn.addEventListener('click', function () {
    box.classList.toggle('open');
    if (box.classList.contains('open')) {
      if (!greeted) {
        greeted = true;
        addMsg('Здравствуйте! Я помогу подобрать мебель, рассчитать цену и оформить заявку. Что вас интересует?', 'bot');
      }
      input.focus();
    }
  });
  box.querySelector('#rtChatClose').addEventListener('click', function () {
    box.classList.remove('open');
  });

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.dispatchEvent(new Event('submit'));
    }
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (busy) return;
    var text = input.value.trim();
    if (!text) return;

    addMsg(text, 'user');
    input.value = '';
    busy = true;
    send.disabled = true;
    var typing = addMsg('печатает...', 'bot typing');

    fetch('/api/ai-chat/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId, message: text }),
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (data) {
        typing.remove();
        addMsg(data.reply || 'Извините, произошла ошибка. Попробуйте позже.', 'bot');
      })
      .catch(function () {
        typing.remove();
        addMsg('Не получилось отправить сообщение. Проверьте интернет и попробуйте ещё раз.', 'bot');
      })
      .finally(function () {
        busy = false;
        send.disabled = false;
        input.focus();
      });
  });
})();
