(function() {
  function waitFor(fn, cb) {
    if (fn()) cb(); else setTimeout(function(){ waitFor(fn, cb); }, 200);
  }

  // Состояние промокода
  var promoState = { valid: false, code: '', discount_pct: 0, partner_name: '' };

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

    // ─── Блок промокода ─────────────────────────────────────────────────────
    var promoBlock = document.createElement('div');
    promoBlock.id = 'promoBlock';
    promoBlock.style.cssText = 'margin-top:12px';
    promoBlock.innerHTML =
      '<div style="display:flex;gap:8px;align-items:center">' +
        '<input id="promoInput" type="text" placeholder="Промокод (если есть)" ' +
          'style="flex:1;padding:11px 14px;border:1.5px solid #e2e8f0;border-radius:10px;' +
          'font-family:inherit;font-size:14px;font-weight:600;text-transform:uppercase;outline:none">' +
        '<button id="promoApplyBtn" onclick="applyPromo()" ' +
          'style="padding:11px 16px;background:#21372F;color:#fff;border:none;border-radius:10px;' +
          'font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap">' +
          'Применить</button>' +
      '</div>' +
      '<div id="promoMsg" style="margin-top:6px;font-size:13px;font-weight:600;display:none"></div>';

    // ─── Кнопка отправки ─────────────────────────────────────────────────────
    var btn = document.createElement('button');
    btn.id = 'mebelOrderBtn';
    btn.textContent = '✅ Отправить заявку';
    btn.style.cssText = 'width:100%;border:none;cursor:pointer;font-family:inherit;' +
      'background:#21372F;color:#fff;font-weight:800;font-size:16px;' +
      'padding:15px;border-radius:14px;margin-top:10px;display:block';

    btn.onclick = function() {
      var nameEl  = document.getElementById('cName');
      var phoneEl = document.getElementById('cPhone');
      var addrEl  = document.getElementById('cAddr');
      var noteEl  = document.getElementById('cNote');

      var name  = nameEl  ? nameEl.value.trim()  : '';
      var phone = phoneEl ? phoneEl.value.trim()  : '';
      var addr  = addrEl  ? addrEl.value.trim()  : '';
      var note  = noteEl  ? noteEl.value.trim()  : '';

      if (!phone || phone.replace(/\D/g,'').length < 10) {
        if (typeof toast === 'function') toast('Введите телефон');
        else alert('Введите телефон');
        return;
      }

      btn.textContent = '⏳ Отправляем...';
      btn.disabled = true;

      // Собираем текст заказа и считаем сумму
      var orderText = '';
      var orderAmount = 0;
      var productNames = [];
      if (typeof entries === 'function') {
        entries().forEach(function(e) {
          orderText += e.name + ' × ' + e.qty;
          if (e.price) {
            var lineTotal = e.qty * e.price;
            orderText += ' = ' + lineTotal + ' ₽';
            orderAmount += lineTotal;
          }
          orderText += '; ';
          productNames.push(e.name);
        });
      }

      // Применяем скидку промокода к итоговой сумме
      if (promoState.valid && promoState.discount_pct > 0) {
        var discount = Math.round(orderAmount * promoState.discount_pct / 100);
        orderText += ' [Скидка ' + promoState.discount_pct + '% по промокоду ' + promoState.code + ': −' + discount + ' ₽]';
        orderAmount = orderAmount - discount;
      }

      var payload = {
        name: name || 'Не указано',
        phone: phone,
        message: ('Заказ: ' + orderText +
          (addr ? ' Адрес: ' + addr : '') +
          (note ? ' Комментарий: ' + note : '')).trim(),
        source: 'site'
      };

      // Добавляем данные промокода если применён
      if (promoState.valid) {
        payload.promo_code    = promoState.code;
        payload.order_amount  = orderAmount;
        payload.product_name  = productNames.join(', ');
      }

      fetch('/api/public/lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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

    // Добавляем блок промокода и кнопку
    cartSummary.appendChild(promoBlock);
    cartSummary.appendChild(btn);
  }

  // ─── Применить промокод ───────────────────────────────────────────────────
  window.applyPromo = function() {
    var input = document.getElementById('promoInput');
    var msg   = document.getElementById('promoMsg');
    var applyBtn = document.getElementById('promoApplyBtn');
    var code  = (input ? input.value.trim().toUpperCase() : '');
    if (!code) return;

    // Если уже применён — сбросить
    if (promoState.valid) {
      promoState = { valid: false, code: '', discount_pct: 0, partner_name: '' };
      if (input) { input.value = ''; input.disabled = false; input.style.borderColor = '#e2e8f0'; }
      if (msg)   { msg.style.display = 'none'; }
      if (applyBtn) applyBtn.textContent = 'Применить';
      updatePromoDisplay();
      return;
    }

    if (applyBtn) applyBtn.textContent = '⏳';
    fetch('/api/public/promo/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
      if (applyBtn) applyBtn.textContent = 'Убрать';
      if (data.valid) {
        promoState = { valid: true, code: code, discount_pct: data.discount_pct, partner_name: data.partner_name };
        if (input) { input.disabled = true; input.style.borderColor = '#38a169'; }
        if (msg) {
          msg.style.display = 'block';
          msg.style.color = '#276749';
          msg.textContent = '✅ Промокод применён — скидка ' + data.discount_pct + '%';
        }
      } else {
        promoState = { valid: false, code: '', discount_pct: 0, partner_name: '' };
        if (applyBtn) applyBtn.textContent = 'Применить';
        if (input) input.style.borderColor = '#e53e3e';
        if (msg) {
          msg.style.display = 'block';
          msg.style.color = '#c53030';
          msg.textContent = '❌ Промокод не найден или неактивен';
        }
      }
      updatePromoDisplay();
    })
    .catch(function() {
      if (applyBtn) applyBtn.textContent = 'Применить';
      if (msg) { msg.style.display = 'block'; msg.style.color = '#c53030'; msg.textContent = 'Ошибка проверки промокода'; }
    });
  };

  // Пересчитать итог в корзине с учётом скидки
  function updatePromoDisplay() {
    var totalEl = document.getElementById('cartTotal');
    if (!totalEl) return;
    var baseText = totalEl.getAttribute('data-base') || totalEl.textContent;
    totalEl.setAttribute('data-base', baseText);
    var baseAmount = parseInt(baseText.replace(/\D/g, '')) || 0;
    if (promoState.valid && promoState.discount_pct > 0 && baseAmount > 0) {
      var discount = Math.round(baseAmount * promoState.discount_pct / 100);
      var newTotal = baseAmount - discount;
      totalEl.innerHTML =
        '<span style="text-decoration:line-through;color:#a0aec0;font-size:14px">' + baseAmount.toLocaleString('ru-RU') + ' ₽</span> ' +
        '<span style="color:#38a169">' + newTotal.toLocaleString('ru-RU') + ' ₽</span>' +
        '<span style="font-size:11px;color:#38a169;margin-left:4px">−' + discount.toLocaleString('ru-RU') + ' ₽</span>';
    } else {
      totalEl.textContent = baseText;
    }
  }

  // Следим за появлением корзины
  var observer = new MutationObserver(function() { addOrderButton(); });
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener('DOMContentLoaded', addOrderButton);
  setTimeout(addOrderButton, 1000);
})();
