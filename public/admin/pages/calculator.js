// Calculator page
$('content').innerHTML = `
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px" class="calc-grid">
    <div class="card">
      <div class="card-header">🧮 Коэффициенты цен</div>
      <div class="card-body">
        <div id="calcFields"><div class="loader">Загрузка...</div></div>
        <button class="btn btn-primary" style="margin-top:16px" onclick="saveCalc()">💾 Сохранить</button>
      </div>
    </div>
    <div class="card">
      <div class="card-header">🧪 Тест калькулятора</div>
      <div class="card-body">
        <div class="form-group"><label>Площадь (м²)</label><input type="number" id="calcArea" value="2" min="0.1" step="0.1" oninput="calcPreview()"></div>
        <div class="form-group">
          <label>Материал</label>
          <select id="calcMaterial" onchange="calcPreview()">
            <option value="pine">Сосна</option>
            <option value="oak">Дуб</option>
            <option value="mdf">МДФ</option>
          </select>
        </div>
        <div class="form-group">
          <label>Фурнитура</label>
          <select id="calcFurniture" onchange="calcPreview()">
            <option value="standard">Стандарт</option>
            <option value="premium">Премиум</option>
          </select>
        </div>
        <div style="background:var(--bg);border-radius:var(--r);padding:16px;margin-top:8px">
          <div style="font-size:13px;color:var(--text-muted)">Ориентировочная стоимость:</div>
          <div id="calcResult" style="font-size:28px;font-weight:800;color:var(--accent)">—</div>
          <div style="font-size:12px;color:var(--text-muted)">* Итоговая цена зависит от сложности изделия</div>
        </div>
      </div>
    </div>
  </div>
  <style>@media(max-width:768px){.calc-grid{grid-template-columns:1fr!important}}</style>
`;

let calcCoefs = {};

async function loadCalc() {
  const items = await api('GET', '/api/calculator');
  calcCoefs = {};
  items.forEach(i => calcCoefs[i.id] = i);

  $('calcFields').innerHTML = items.map(i => `
    <div class="form-group">
      <label>${i.label}</label>
      <input type="number" id="calc-${i.id}" value="${i.value}" step="0.1" min="0" oninput="calcPreview()">
    </div>`).join('');

  calcPreview();
}

function calcPreview() {
  const area = parseFloat($('calcArea')?.value) || 0;
  const mat = $('calcMaterial')?.value || 'pine';
  const fur = $('calcFurniture')?.value || 'standard';

  const base = parseFloat($(`calc-base_price`)?.value) || calcCoefs['base_price']?.value || 5000;
  const matCoef = parseFloat($(`calc-coef_${mat}`)?.value) || calcCoefs[`coef_${mat}`]?.value || 1;
  const furCoef = parseFloat($(`calc-coef_${fur}`)?.value) || calcCoefs[`coef_${fur}`]?.value || 1;

  const price = Math.round(area * base * matCoef * furCoef);
  const el = $('calcResult');
  if (el) el.textContent = price > 0 ? fmtPrice(price) : '—';
}

async function saveCalc() {
  const data = {};
  Object.keys(calcCoefs).forEach(id => {
    const el = $(`calc-${id}`);
    if (el) data[id] = el.value;
  });
  try {
    await api('POST', '/api/calculator', data);
    toast('Коэффициенты сохранены', 'success');
    loadCalc();
  } catch(e) { toast(e.message, 'error'); }
}

loadCalc();
