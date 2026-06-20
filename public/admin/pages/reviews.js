// Reviews page
(async function() {
  $('content').innerHTML = `
    <div class="tabs">
      <button class="tab active" onclick="showTab('pending',this)">⏳ На модерации</button>
      <button class="tab" onclick="showTab('approved',this)">✅ Опубликованные</button>
    </div>
    <div id="reviewsList"><div class="loader">Загрузка...</div></div>
  `;

  let reviews = [];

  async function load() {
    reviews = await api('GET', '/api/reviews');
    showTab('pending');
  }

  window.showTab = function(status, btn) {
    $$('.tab').forEach(t => t.classList.remove('active'));
    if (btn) btn.classList.add('active');
    const filtered = reviews.filter(r => r.status === status);
    $('reviewsList').innerHTML = filtered.length
      ? filtered.map(r => `
        <div class="review-card">
          <div style="display:flex;justify-content:space-between;align-items:start">
            <div>
              <div class="review-author">${r.author}</div>
              <div class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</div>
            </div>
            <div class="review-meta">${fmtDate(r.created_at)}</div>
          </div>
          <div class="review-text">${r.text}</div>
          <div style="display:flex;gap:6px;margin-top:8px">
            ${status === 'pending'
              ? `<button class="btn btn-success btn-sm" onclick="modReview(${r.id},'approved')">✅ Опубликовать</button>`
              : `<button class="btn btn-ghost btn-sm" onclick="modReview(${r.id},'pending')">↩ На модерацию</button>`
            }
            <button class="btn btn-danger btn-sm" onclick="delReview(${r.id})">🗑️ Удалить</button>
          </div>
        </div>`).join('')
      : '<div class="empty-state"><div class="empty-icon">⭐</div><p>Отзывов нет</p></div>';
  };

  window.modReview = async function(id, status) {
    await api('PUT', `/api/reviews/${id}/status`, { status });
    toast(status === 'approved' ? 'Опубликован' : 'Снят с публикации', 'success');
    load();
  };

  window.delReview = async function(id) {
    if (!confirm('Удалить отзыв?')) return;
    await api('DELETE', `/api/reviews/${id}`);
    toast('Удалено');
    load();
  };

  load();
})();
