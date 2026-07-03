(function() {
  function waitFor(fn, cb) {
    if (fn()) cb(); else setTimeout(function(){ waitFor(fn, cb); }, 200);
  }

  function addOrderButton() {
    var cartSummary = document.getElementById('cartSummary');
    if (!cartSummary || document.getElementById('mebelOrderBtn')) return;

    // Скрываем старые кнопки отправки
    var btns = cartSummary.querySelectorAll('button');
    btns.forEach(function(b) {
      var t = b.textContent || '';
      if (t.indexOf('ВКонтакте') > -1 || t.indexOf('Telegram') > -1 ||
          t.indexOf('MAX') > -1 || t.indexOf('SMS') > -1 ||
          t.indexOf('Скопировать') > -1 || t.indexOf('Скопируй') > -1) {
        b.style.display = 'none';
      }
    });

    // Создаём новую кнопку
    var btn = document.createElement('button');
    btn.id = 'mebelOrderBtn';
    btn.textContent = '✅ Отправить заявку';
    btn.style.cssText = 'width:100%;border:none;cursor:pointer;font-family:inherit;' +
      'background:#21372F;color:#fff;font-weight:800;font-size:16px;' +
      'padding:15px;border-radius:14px;margin-top:10px;display:block';

    btn.onclick = function() {
      var nameEl = document.getElementById('cName');
      var phoneEl = document.getElementById('cPhone');
      var addrEl = document.getElementById('cAddr');
      var noteEl = document.getElementById('cNote');

      var name = nameEl ? nameEl.value.trim() : '';
      var phone = phoneEl ? phoneEl.value.trim() : '';
      var addr = addrEl ? addrEl.value.trim() : '';
      var note = noteEl ? noteEl.value.trim() : '';

      if (!phone || phone.replace(/\D/g,'').length < 10) {
        if (typeof toast === 'function') toast('Введите телефон');
        else alert('Введите телефон');
        return;
      }

      btn.textContent = '⏳ Отправляем...';
      btn.disabled = true;

      // Собираем текст заказа
      var orderText = '';
      if (typeof entries === 'function') {
        entries().forEach(function(e) {
          orderText += e.name + ' × ' + e.qty;
          if (e.price) orderText += ' = ' + e.qty * e.price + ' ₽';
          orderText += '; ';
        });
      }

      fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || 'Не указано',
          phone: phone,
          message: ('Заказ: ' + orderText + (addr ? ' Адрес: ' + addr : '') + (note ? ' Комментарий: ' + note : '')).trim(),
          source: 'site'
        })
      })
      .then(function(r) { return r.json(); })
      .then(function() {
        // Очищаем корзину
        if (typeof cart !== 'undefined') {
          Object.keys(cart).forEach(function(k) { delete cart[k]; });
        }
        if (typeof updateBar === 'function') updateBar();

        // Показываем успех
        var list = document.getElementById('cartList');
        if (list) {
          list.innerHTML = '<div style="text-align:center;padding:50px 20px">' +
            '<div style="font-size:56px">✅</div>' +
            '<div style="font-weight:800;font-size:22px;margin-top:14px;color:#21372F">Заявка принята!</div>' +
            '<div style="color:#6E7C72;margin-top:10px;font-size:15px">Мы свяжемся с вами<br>в ближайшее время</div>' +
            '</div>';
        }
        cartSummary.style.display = 'none';
        if (typeof toast === 'function') toast('Заявка отправлена! 🎉');
      })
      .catch(function() {
        btn.textContent = '✅ Отправить заявку';
        btn.disabled = false;
        if (typeof toast === 'function') toast('Ошибка. Попробуйте ещё раз');
        else alert('Ошибка. Попробуйте ещё раз');
      });
    };

    // Добавляем кнопку в конец cartSummary
    cartSummary.appendChild(btn);
  }

  // Следим за появлением корзины
  var observer = new MutationObserver(function() {
    addOrderButton();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Также проверяем сразу
  document.addEventListener('DOMContentLoaded', addOrderButton);
  setTimeout(addOrderButton, 1000);
})();
