'use strict';

// ===== データ =====
const STORAGE_KEY = 'workout-app-v1';
const DEFAULT_EXERCISES = [
  'ベンチプレス', 'スクワット', 'デッドリフト', 'ショルダープレス',
  'ラットプルダウン', 'ベントオーバーロウ', 'ダンベルカール', 'トライセプスエクステンション',
  'レッグプレス', 'レッグカール', 'チンニング（懸垂）', 'ディップス', '腕立て伏せ', 'プランク',
];

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      return {
        workouts: s.workouts || {},
        settings: { restDefault: 90, restAuto: true, ...(s.settings || {}) },
      };
    }
  } catch (e) {
    console.warn('データの読み込みに失敗しました', e);
  }
  return { workouts: {}, settings: { restDefault: 90, restAuto: true } };
}

let state = loadState();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    alert('保存に失敗しました。ブラウザのストレージ設定を確認してください。');
  }
}

// ===== ユーティリティ =====
const $ = (sel) => document.querySelector(sel);

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  const wd = '日月火水木金土'[new Date(y, m - 1, d).getDay()];
  return `${y}/${m}/${d}（${wd}）`;
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Epley式による推定1RM
function estimate1RM(weight, reps) {
  if (!(weight > 0) || !(reps > 0)) return 0;
  return reps === 1 ? weight : weight * (1 + reps / 30);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function sortedDates() {
  return Object.keys(state.workouts)
    .filter((d) => state.workouts[d].entries.length > 0)
    .sort();
}

function allExerciseNames() {
  const names = new Set();
  for (const d of Object.keys(state.workouts)) {
    for (const e of state.workouts[d].entries) names.add(e.exercise);
  }
  return [...names];
}

function setLabel(s) {
  return s.w > 0 ? `${s.w}kg×${s.r}` : `${s.r}回`;
}

// 指定日より前の同じ種目の記録を探す
function previousEntry(exercise, beforeDate) {
  const dates = sortedDates().filter((d) => d < beforeDate).reverse();
  for (const d of dates) {
    const entry = state.workouts[d].entries.find((e) => e.exercise === exercise);
    if (entry) return { date: d, entry };
  }
  return null;
}

// ===== 記録画面 =====
let currentDate = todayStr();

function getWorkout(date) {
  if (!state.workouts[date]) state.workouts[date] = { entries: [] };
  return state.workouts[date];
}

function cleanupEmpty(date) {
  if (state.workouts[date] && state.workouts[date].entries.length === 0) {
    delete state.workouts[date];
  }
}

function renderExerciseList() {
  const names = new Set([...allExerciseNames(), ...DEFAULT_EXERCISES]);
  $('#exercise-list').innerHTML = [...names].map((n) => `<option value="${escapeHtml(n)}">`).join('');
}

function renderToday() {
  $('#workout-date').value = currentDate;
  const workout = state.workouts[currentDate];
  const entries = workout ? workout.entries : [];
  $('#today-empty').style.display = entries.length ? 'none' : 'block';

  $('#today-entries').innerHTML = entries.map((entry) => {
    const prev = previousEntry(entry.exercise, currentDate);
    const prevText = prev
      ? `前回 ${formatDate(prev.date)}: ${prev.entry.sets.filter((s) => s.done).map(setLabel).join(', ') || '完了セットなし'}`
      : '初めての種目です';
    const sets = entry.sets.map((s, i) => `
      <div class="set-row ${s.done ? 'done' : ''}" data-entry="${entry.id}" data-set="${i}">
        <span class="set-num">${i + 1}</span>
        <input type="number" inputmode="decimal" step="0.5" min="0" data-field="w" value="${s.w ?? ''}" placeholder="kg">
        <input type="number" inputmode="numeric" step="1" min="0" data-field="r" value="${s.r ?? ''}" placeholder="回">
        <button class="check" data-action="toggle-set" aria-label="セット完了">✓</button>
        <button class="remove" data-action="remove-set" aria-label="セット削除">×</button>
      </div>`).join('');

    return `
      <div class="card" data-entry-card="${entry.id}">
        <div class="entry-head">
          <span class="entry-name">${escapeHtml(entry.exercise)}</span>
          <button class="btn ghost small" data-action="remove-entry" data-entry="${entry.id}">種目を削除</button>
        </div>
        <div class="entry-prev">${escapeHtml(prevText)}</div>
        <div class="set-row set-labels"><span>#</span><span>重量(kg)</span><span>回数</span><span>完了</span><span></span></div>
        ${sets}
        <div class="entry-actions">
          <button class="btn small" data-action="add-set" data-entry="${entry.id}">＋ セット追加</button>
        </div>
      </div>`;
  }).join('');
}

function findEntry(id) {
  return getWorkout(currentDate).entries.find((e) => e.id === id);
}

function addExercise() {
  const name = $('#exercise-input').value.trim();
  if (!name) return;
  const workout = getWorkout(currentDate);
  if (workout.entries.some((e) => e.exercise === name)) {
    alert('この種目はすでに追加されています');
    return;
  }
  // 前回の記録があればセット内容を引き継ぐ
  const prev = previousEntry(name, currentDate);
  const sets = prev && prev.entry.sets.length
    ? prev.entry.sets.map((s) => ({ w: s.w, r: s.r, done: false }))
    : [{ w: null, r: null, done: false }];
  workout.entries.push({ id: uid(), exercise: name, sets });
  $('#exercise-input').value = '';
  save();
  renderExerciseList();
  renderToday();
}

$('#add-exercise').addEventListener('click', addExercise);
$('#exercise-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addExercise();
});

$('#workout-date').addEventListener('change', (e) => {
  cleanupEmpty(currentDate);
  currentDate = e.target.value || todayStr();
  renderToday();
});

$('#today-entries').addEventListener('input', (e) => {
  const input = e.target;
  const row = input.closest('.set-row');
  if (!row || !input.dataset.field) return;
  const entry = findEntry(row.dataset.entry);
  const set = entry.sets[Number(row.dataset.set)];
  const v = input.value === '' ? null : Number(input.value);
  set[input.dataset.field] = Number.isFinite(v) ? v : null;
  save();
});

$('#today-entries').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const row = btn.closest('.set-row');
  const entryId = row ? row.dataset.entry : btn.dataset.entry;
  const workout = getWorkout(currentDate);
  const entry = findEntry(entryId);
  if (!entry) return;

  if (action === 'add-set') {
    const last = entry.sets[entry.sets.length - 1];
    entry.sets.push({ w: last ? last.w : null, r: last ? last.r : null, done: false });
  } else if (action === 'remove-set') {
    entry.sets.splice(Number(row.dataset.set), 1);
    if (entry.sets.length === 0) entry.sets.push({ w: null, r: null, done: false });
  } else if (action === 'toggle-set') {
    const set = entry.sets[Number(row.dataset.set)];
    if (!set.done && !(set.r > 0)) {
      alert('回数を入力してください');
      return;
    }
    set.done = !set.done;
    if (set.done && state.settings.restAuto) startTimer(state.settings.restDefault);
  } else if (action === 'remove-entry') {
    if (!confirm(`「${entry.exercise}」を削除しますか？`)) return;
    workout.entries = workout.entries.filter((x) => x.id !== entryId);
    cleanupEmpty(currentDate);
  }
  save();
  renderToday();
});

// ===== 履歴画面 =====
function renderHistory() {
  const dates = sortedDates().reverse();
  $('#history-empty').style.display = dates.length ? 'none' : 'block';
  $('#history-list').innerHTML = dates.map((d) => {
    const entries = state.workouts[d].entries;
    const doneSets = entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
    const body = entries.map((e) => `
      <div class="history-ex">
        <strong>${escapeHtml(e.exercise)}</strong>
        <span class="history-sets">${e.sets.filter((s) => s.done).map(setLabel).join(' / ') || '完了セットなし'}</span>
      </div>`).join('');
    return `
      <details class="card history-day">
        <summary>
          <span class="history-date">${formatDate(d)}</span>
          <span class="history-meta">${entries.length}種目・${doneSets}セット</span>
        </summary>
        ${body}
        <div class="entry-actions">
          <button class="btn small" data-open-date="${d}">編集する</button>
        </div>
      </details>`;
  }).join('');
}

$('#history-list').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-open-date]');
  if (!btn) return;
  currentDate = btn.dataset.openDate;
  showView('today');
});

// ===== 分析画面 =====
function exerciseHistory(name) {
  // 日付ごとの完了セットを集計
  const points = [];
  for (const d of sortedDates()) {
    const entry = state.workouts[d].entries.find((e) => e.exercise === name);
    if (!entry) continue;
    const done = entry.sets.filter((s) => s.done && s.r > 0);
    if (!done.length) continue;
    points.push({
      date: d,
      maxWeight: Math.max(...done.map((s) => s.w || 0)),
      best1RM: Math.max(...done.map((s) => estimate1RM(s.w || 0, s.r))),
      volume: done.reduce((v, s) => v + (s.w || 0) * s.r, 0),
    });
  }
  return points;
}

function renderStats() {
  const select = $('#stats-exercise');
  const names = allExerciseNames().sort((a, b) => a.localeCompare(b, 'ja'));
  const prevValue = select.value;
  select.innerHTML = names.length
    ? names.map((n) => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('')
    : '<option value="">（記録なし）</option>';
  if (names.includes(prevValue)) select.value = prevValue;

  const points = select.value ? exerciseHistory(select.value) : [];
  if (points.length) {
    $('#stat-max').textContent = `${Math.max(...points.map((p) => p.maxWeight))}kg`;
    $('#stat-1rm').textContent = `${round1(Math.max(...points.map((p) => p.best1RM)))}kg`;
    $('#stat-sessions').textContent = `${points.length}回`;
    $('#stat-volume').textContent = `${Math.round(points.reduce((v, p) => v + p.volume, 0)).toLocaleString()}kg`;
  } else {
    ['#stat-max', '#stat-1rm', '#stat-sessions', '#stat-volume'].forEach((s) => { $(s).textContent = '-'; });
  }
  drawChart(points);

  // 直近7日間
  const since = new Date();
  since.setDate(since.getDate() - 6);
  const sinceStr = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`;
  const recent = sortedDates().filter((d) => d >= sinceStr && d <= todayStr());
  const sets = recent.reduce((n, d) => n + state.workouts[d].entries.reduce((m, e) => m + e.sets.filter((s) => s.done).length, 0), 0);
  $('#week-days').textContent = `${recent.length}日`;
  $('#week-sets').textContent = `${sets}セット`;
}

function drawChart(points) {
  const canvas = $('#stats-chart');
  const data = points.filter((p) => p.best1RM > 0);
  const show = data.length >= 2;
  canvas.style.display = show ? 'block' : 'none';
  $('#chart-empty').style.display = show ? 'none' : 'block';
  if (!show) return;

  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = 220;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const styles = getComputedStyle(document.documentElement);
  const muted = styles.getPropertyValue('--muted').trim();
  const border = styles.getPropertyValue('--border').trim();
  const primary = styles.getPropertyValue('--primary').trim();

  const pad = { l: 40, r: 12, t: 12, b: 28 };
  const values = data.map((p) => p.best1RM);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 5; max += 5; }
  const range = max - min;
  min = Math.max(0, min - range * 0.1);
  max += range * 0.1;

  const x = (i) => pad.l + (i / (data.length - 1)) * (width - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (height - pad.t - pad.b);

  // 目盛り
  ctx.font = '11px sans-serif';
  ctx.fillStyle = muted;
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = min + ((max - min) * i) / 4;
    const yy = y(v);
    ctx.beginPath();
    ctx.moveTo(pad.l, yy);
    ctx.lineTo(width - pad.r, yy);
    ctx.stroke();
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(v), pad.l - 6, yy + 4);
  }
  ctx.textAlign = 'center';
  const labelIdx = new Set([0, data.length - 1, Math.floor((data.length - 1) / 2)]);
  labelIdx.forEach((i) => {
    const [, m, d] = data[i].date.split('-').map(Number);
    ctx.fillText(`${m}/${d}`, x(i), height - 8);
  });

  // 折れ線
  ctx.strokeStyle = primary;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  data.forEach((p, i) => (i ? ctx.lineTo(x(i), y(p.best1RM)) : ctx.moveTo(x(i), y(p.best1RM))));
  ctx.stroke();
  ctx.fillStyle = primary;
  data.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(x(i), y(p.best1RM), 3.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

$('#stats-exercise').addEventListener('change', renderStats);
window.addEventListener('resize', () => {
  if ($('#view-stats').classList.contains('active')) renderStats();
});

// ===== レストタイマー =====
let timerEnd = 0;
let timerInterval = null;
let audioCtx = null;

function beep() {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach((t) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.2;
      osc.connect(gain).connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + t);
      osc.stop(audioCtx.currentTime + t + 0.15);
    });
  } catch (e) { /* 音が鳴らせない環境では無視 */ }
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}

function updateTimer() {
  const remain = Math.max(0, Math.round((timerEnd - Date.now()) / 1000));
  $('#timer-display').textContent = `${Math.floor(remain / 60)}:${String(remain % 60).padStart(2, '0')}`;
  if (remain === 0 && !$('#timer').classList.contains('finished')) {
    $('#timer').classList.add('finished');
    beep();
  }
}

function startTimer(seconds) {
  // ユーザー操作の中でAudioContextを作っておく（iOS対策）
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* noop */ }
  timerEnd = Date.now() + seconds * 1000;
  $('#timer').classList.remove('hidden', 'finished');
  clearInterval(timerInterval);
  timerInterval = setInterval(updateTimer, 250);
  updateTimer();
}

function stopTimer() {
  clearInterval(timerInterval);
  $('#timer').classList.add('hidden');
}

$('#timer-stop').addEventListener('click', stopTimer);
$('#timer-plus').addEventListener('click', () => {
  timerEnd = Math.max(timerEnd, Date.now()) + 15000;
  $('#timer').classList.remove('finished');
  updateTimer();
});
$('#timer-minus').addEventListener('click', () => {
  timerEnd = Math.max(Date.now(), timerEnd - 15000);
  updateTimer();
});

// ===== 設定画面 =====
function renderSettings() {
  $('#rest-default').value = state.settings.restDefault;
  $('#rest-auto').checked = state.settings.restAuto;
}

$('#rest-default').addEventListener('change', (e) => {
  const v = Math.min(600, Math.max(10, Number(e.target.value) || 90));
  state.settings.restDefault = v;
  e.target.value = v;
  save();
});
$('#rest-auto').addEventListener('change', (e) => {
  state.settings.restAuto = e.target.checked;
  save();
});

$('#export-data').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `workout-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

$('#import-data').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data.workouts !== 'object') throw new Error('invalid');
    if (!confirm('現在のデータを読み込んだバックアップで置き換えますか？')) return;
    state = {
      workouts: data.workouts,
      settings: { restDefault: 90, restAuto: true, ...(data.settings || {}) },
    };
    save();
    renderAll();
    alert('読み込みました');
  } catch (err) {
    alert('バックアップファイルを読み込めませんでした');
  } finally {
    e.target.value = '';
  }
});

$('#clear-data').addEventListener('click', () => {
  if (!confirm('すべての記録を削除します。元に戻せません。よろしいですか？')) return;
  state = { workouts: {}, settings: state.settings };
  save();
  renderAll();
});

// ===== 画面切り替え =====
const TITLES = { today: '今日のトレーニング', history: '履歴', stats: '分析', settings: '設定' };

function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === name));
  $('#view-title').textContent = name === 'today' && currentDate !== todayStr() ? formatDate(currentDate) : TITLES[name];
  if (name === 'today') renderToday();
  if (name === 'history') renderHistory();
  if (name === 'stats') renderStats();
  if (name === 'settings') renderSettings();
  window.scrollTo(0, 0);
}

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  if (t.dataset.view === 'today' && $('#view-today').classList.contains('active')) currentDate = todayStr();
  showView(t.dataset.view);
}));
$('#workout-date').addEventListener('change', () => showView('today'));

function renderAll() {
  renderExerciseList();
  renderToday();
  renderSettings();
}

renderAll();

// オフライン対応（https または localhost のときのみ）
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
