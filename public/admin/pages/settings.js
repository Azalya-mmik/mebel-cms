// Settings page
$('content').innerHTML = `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px" class="settings-grid">
    <!-- Contact info -->
    <div class="card">
      <div class="card-header">📞 Контактная информация</div>
      <div class="card-body">
        <div class="form-group"><label>Телефон</label><input type="tel" id="s-phone"></div>
        <div class="form-group"><label>Email</label><input type="email" id="s-email"></div>
        <div class="form-group"><label>Адрес</label><input type="text" id="s-address"></div>
        <button class="btn btn-primary" onclick="saveSection('contact')">💾 Сохранить</button>
      </div>
    </div>

    <!-- Social networks -->
    <div class="card">
      <div class="card-header">🌐 Социальные сети</div>
      <div class="card-body">
        <div class="form-group"><label>ВКонтакте (ссылка)</label><input type="text" id="s-vk" placeholder="https://vk.com/..."></div>
        <div class="form-group"><label>Telegram (ссылка)</label><input type="text" id="s-telegram" placeholder="https://t.me/..."></div>
        <div class="form-group"><label>WhatsApp (номер)</label><input type="text" id="s-whatsapp" placeholder="+7..."></div>
        <button class="btn btn-primary" onclick="saveSection('social')">💾 Сохранить</button>
      </div>
    </div>

    <!-- Site info -->
    <div class="card">
      <div class="card-header">🌍 Информация о сайте</div>
      <div class="card-body">
        <div class="form-group"><label>Название сайта</label><input type="text" id="s-site_name"></div>
        <div class="form-group"><label>Подзаголовок</label><input type="text" id="s-site_tagline"></div>
        <button class="btn btn-primary" onclick="saveSection('site')">💾 Сохранить</button>
      </div>
    </div>

    <!-- Banner -->
    <div class="card">
      <div class="card-header">🎉 Баннер акции</div>
      <div class="card-body">
        <div class="form-group">
          <label>Показывать баннер</label>
          <label class="toggle-wrap">
            <label class="toggle"><input type="checkbox" id="s-banner_active"><span class="toggle-slider"></span></label>
            <span id="bannerStatus">Выкл</span>
          </label>
        </div>
        <div class="form-group"><label>Заголовок акции</label><input type="text" id="s-banner_title" placeholder="Весенняя акция!"></div>
        <div class="form-group"><label>Текст акции</label><textarea id="s-banner_text" placeholder="Скидка 10% на все диваны"></textarea></div>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary" onclick="saveSection('banner')">💾 Сохранить</button>
          <a href="/" target="_blank" class="btn btn-ghost">👁️ Посмотреть</a>
        </div>
      </div>
    </div>
  </div>
  <style>@media(max-width:768px){.settings-grid{grid-template-columns:1fr!important}}</style>
`;

async function loadSettings() {
  try {
    const s = await api('GET', '/api/settings');
    const fields = ['phone', 'email', 'address', 'vk', 'telegram', 'whatsapp', 'site_name', 'site_tagline', 'banner_title', 'banner_text'];
    fields.forEach(key => {
      const el = $(`s-${key}`);
      if (el) el.value = s[key] || '';
    });
    const bannerToggle = $('s-banner_active');
    if (bannerToggle) {
      bannerToggle.checked = s.banner_active === '1';
      $('bannerStatus').textContent = bannerToggle.checked ? 'Вкл' : 'Выкл';
      bannerToggle.addEventListener('change', function() {
        $('bannerStatus').textContent = this.checked ? 'Вкл' : 'Выкл';
      });
    }
  } catch(e) {
    toast('Ошибка загрузки настроек', 'error');
  }
}

async function saveSection(section) {
  const data = {};
  const sectionFields = {
    contact: ['phone', 'email', 'address'],
    social: ['vk', 'telegram', 'whatsapp'],
    site: ['site_name', 'site_tagline'],
    banner: ['banner_title', 'banner_text', 'banner_active']
  };

  for (const key of sectionFields[section] || []) {
    const el = $(`s-${key}`);
    if (el) {
      data[key] = el.type === 'checkbox' ? (el.checked ? '1' : '0') : el.value;
    }
  }

  try {
    await api('POST', '/api/settings', data);
    toast('Настройки сохранены ✓', 'success');
  } catch(e) {
    toast(e.message, 'error');
  }
}

loadSettings();
