const tg = window.Telegram?.WebApp;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  file: null,
  outputType: 'image/png',
  quality: 0.9,
  history: JSON.parse(localStorage.getItem('fileconvert-history') || '[]')
};

function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  tg.setHeaderColor?.('secondary_bg_color');
  tg.setBackgroundColor?.('bg_color');
  applyTelegramTheme();
  tg.onEvent?.('themeChanged', applyTelegramTheme);
}

function applyTelegramTheme() {
  if (!tg?.colorScheme) return;
  document.body.classList.toggle('dark', tg.colorScheme === 'dark');
}

function showScreen(name) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.dataset.screen === name));
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.nav === name));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

function formatSize(bytes) {
  if (!bytes) return '0 Б';
  const units = ['Б', 'КБ', 'МБ', 'ГБ'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${units[i]}`;
}

function extensionFromMime(mime) {
  return ({ 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WEBP' })[mime] || 'IMG';
}

function setFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) return toast('Выберите изображение');
  if (file.size > 20 * 1024 * 1024) return toast('Файл больше 20 МБ');

  state.file = file;
  $('#fileName').textContent = file.name;
  $('#fileMeta').textContent = `${extensionFromMime(file.type)} · ${formatSize(file.size)}`;
  $('#filePreview').textContent = extensionFromMime(file.type);
  $('#dropZone').classList.add('hidden');
  $('#filePanel').classList.remove('hidden');
  $('#convertButton').disabled = false;
  updateQualityVisibility();
}

function updateQualityVisibility() {
  $('#qualitySection').classList.toggle('hidden', state.outputType === 'image/png');
}

function resetFile() {
  state.file = null;
  $('#fileInput').value = '';
  $('#dropZone').classList.remove('hidden');
  $('#filePanel').classList.add('hidden');
  $('#convertButton').disabled = true;
  $('#statusMessage').textContent = '';
  updateQualityVisibility();
}

function saveHistory(item) {
  state.history.unshift(item);
  state.history = state.history.slice(0, 30);
  localStorage.setItem('fileconvert-history', JSON.stringify(state.history));
}

function renderHistory() {
  const list = $('#historyList');
  if (!state.history.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">▱</div><b>История пуста</b><p>Готовые файлы появятся здесь после конвертации.</p></div>`;
    return;
  }
  list.innerHTML = state.history.map(item => `
    <div class="history-item">
      <div class="history-icon">${item.output}</div>
      <div class="history-info"><strong>${escapeHtml(item.name)}</strong><small>${item.input} → ${item.output} · ${item.size}</small></div>
    </div>`).join('');
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}

async function convertImage() {
  if (!state.file) return;
  const button = $('#convertButton');
  const status = $('#statusMessage');
  button.disabled = true;
  status.textContent = 'Подготавливаем изображение…';

  try {
    const bitmap = await createImageBitmap(state.file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (state.outputType === 'image/jpeg') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close?.();

    status.textContent = 'Конвертируем…';
    await new Promise(resolve => setTimeout(resolve, 450));

    const blob = await new Promise(resolve => canvas.toBlob(resolve, state.outputType, state.quality));
    if (!blob) throw new Error('Не удалось создать файл');

    const ext = state.outputType === 'image/png' ? 'png' : state.outputType === 'image/jpeg' ? 'jpg' : 'webp';
    const base = state.file.name.replace(/\.[^.]+$/, '');
    const name = `${base}.${ext}`;
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    const inputExt = extensionFromMime(state.file.type);
    saveHistory({ name, input: inputExt, output: ext.toUpperCase(), size: formatSize(blob.size) });
    renderHistory();
    status.textContent = `Готово · ${formatSize(blob.size)}`;
    toast('Файл успешно сохранён');
    tg?.HapticFeedback?.notificationOccurred?.('success');
  } catch (error) {
    console.error(error);
    status.textContent = 'Не удалось обработать файл';
    toast('Ошибка конвертации');
    tg?.HapticFeedback?.notificationOccurred?.('error');
  } finally {
    button.disabled = false;
  }
}

function bindEvents() {
  $$('.nav-item').forEach(button => button.addEventListener('click', () => {
    const target = button.dataset.nav;
    if (target === 'history') renderHistory();
    showScreen(target);
  }));

  $$('[data-action="home"]').forEach(button => button.addEventListener('click', () => showScreen('home')));
  $('[data-action="image"]').addEventListener('click', () => showScreen('converter'));
  $('[data-action="files"]').addEventListener('click', () => toast('Конвертация файлов появится на следующем этапе'));
  $('#chooseButton').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', e => setFile(e.target.files[0]));
  $('#removeFile').addEventListener('click', resetFile);
  $('#convertButton').addEventListener('click', convertImage);

  $$('.format-button').forEach(button => button.addEventListener('click', () => {
    $$('.format-button').forEach(b => b.classList.remove('active'));
    button.classList.add('active');
    state.outputType = button.dataset.format;
    updateQualityVisibility();
  }));

  $('#qualityInput').addEventListener('input', e => {
    state.quality = Number(e.target.value) / 100;
    $('#qualityValue').textContent = `${e.target.value}%`;
  });

  const drop = $('#dropZone');
  ['dragenter','dragover'].forEach(event => drop.addEventListener(event, e => { e.preventDefault(); drop.style.borderColor = 'var(--primary)'; }));
  ['dragleave','drop'].forEach(event => drop.addEventListener(event, e => { e.preventDefault(); drop.style.borderColor = ''; }));
  drop.addEventListener('drop', e => setFile(e.dataTransfer.files[0]));

  $('#themeButton').addEventListener('click', () => {
    document.body.classList.toggle('dark');
    $('#themeToggle').classList.toggle('active', document.body.classList.contains('dark'));
  });
  $('#themeToggle').addEventListener('click', () => {
    document.body.classList.toggle('dark');
    $('#themeToggle').classList.toggle('active', document.body.classList.contains('dark'));
  });
  $('#clearHistory').addEventListener('click', () => {
    state.history = [];
    localStorage.removeItem('fileconvert-history');
    renderHistory();
    toast('История очищена');
  });
}

initTelegram();
bindEvents();
renderHistory();
