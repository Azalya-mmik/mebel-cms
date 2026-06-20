// FAQ page
$('pageActions').innerHTML = `<button class="btn btn-accent" onclick="openModal('addFaqModal')">+ Добавить вопрос</button>`;

$('content').innerHTML = `
  <div id="faqList"><div class="loader">Загрузка...</div></div>

  <div class="modal-overlay" id="addFaqModal">
    <div class="modal">
      <div class="modal-header"><h3 id="faqModalTitle">Добавить вопрос</h3><button class="modal-close" onclick="closeModal('addFaqModal')">✕</button></div>
      <div class="modal-body">
        <div class="form-group"><label>Вопрос *</label><input type="text" id="faqQ" placeholder="Как долго делается мебель?"></div>
        <div class="form-group"><label>Ответ *</label><textarea id="faqA" style="min-height:120px" placeholder="Срок изготовления..."></textarea></div>
        <input type="hidden" id="faqEditId">
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal('addFaqModal')">Отмена</button>
        <button class="btn btn-primary" onclick="saveFaq()">💾 Сохранить</button>
      </div>
    </div>
  </div>
`;

let allFaqs = [];

async function loadFaq() {
  allFaqs = await api('GET', '/api/faq');
  renderFaq();
}

function renderFaq() {
  if (!allFaqs.length) {
    $('faqList').innerHTML = '<div class="empty-state"><div class="empty-icon">❓</div><p>FAQ пуст</p></div>';
    return;
  }
  $('faqList').innerHTML = allFaqs.map(f => `
    <div class="faq-item" style="${f.active ? '' : 'opacity:.5'}">
      <div class="faq-q">❓ ${f.question}</div>
      <div class="faq-a">${f.answer}</div>
      <div class="faq-actions">
        <button class="btn btn-ghost btn-sm" onclick="editFaq(${f.id})">✏️ Изменить</button>
        <button class="btn btn-ghost btn-sm" onclick="toggleFaq(${f.id},${f.active})">${f.active ? '🙈 Скрыть' : '👁️ Показать'}</button>
        <button class="btn btn-danger btn-sm" onclick="delFaq(${f.id})">🗑️ Удалить</button>
      </div>
    </div>`).join('');
}

function editFaq(id) {
  const f = allFaqs.find(x => x.id === id);
  $('faqModalTitle').textContent = 'Редактировать вопрос';
  $('faqQ').value = f.question;
  $('faqA').value = f.answer;
  $('faqEditId').value = id;
  openModal('addFaqModal');
}

async function saveFaq() {
  const q = $('faqQ').value.trim();
  const a = $('faqA').value.trim();
  if (!q || !a) { toast('Заполните все поля', 'error'); return; }
  const editId = $('faqEditId').value;
  try {
    if (editId) {
      await api('PUT', `/api/faq/${editId}`, { question: q, answer: a, active: 1 });
    } else {
      await api('POST', '/api/faq', { question: q, answer: a });
    }
    toast('Сохранено', 'success');
    closeModal('addFaqModal');
    $('faqEditId').value = '';
    loadFaq();
  } catch(e) { toast(e.message, 'error'); }
}

async function toggleFaq(id, active) {
  const f = allFaqs.find(x => x.id === id);
  await api('PUT', `/api/faq/${id}`, { question: f.question, answer: f.answer, active: active ? 0 : 1 });
  loadFaq();
}

async function delFaq(id) {
  if (!confirm('Удалить вопрос?')) return;
  await api('DELETE', `/api/faq/${id}`);
  toast('Удалено');
  loadFaq();
}

window.editFaq = editFaq;
window.toggleFaq = toggleFaq;
window.delFaq = delFaq;
loadFaq();
