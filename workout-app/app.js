'use strict';

// =====================================================================
// データ
// =====================================================================
const STORAGE_KEY = 'workout-app-v1';
const DEFAULT_SETTINGS = { restDefault: 90, restAuto: true };

function normalize(s) {
  return {
    workouts: s.workouts || {},
    logs: s.logs || {},
    profile: s.profile || {},
    custom: s.custom || [],
    settings: { ...DEFAULT_SETTINGS, ...(s.settings || {}) },
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) {
    console.warn('データの読み込みに失敗しました', e);
  }
  return normalize({});
}

let state = loadState();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    alert('保存に失敗しました。ブラウザのストレージ設定を確認してください。');
  }
}

// =====================================================================
// ユーティリティ
// =====================================================================
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const WEEKDAYS = '日月火水木金土';

function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}
const todayStr = () => dateStr(new Date());
function addDays(str, n) {
  const d = parseDate(str);
  d.setDate(d.getDate() + n);
  return dateStr(d);
}
function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}
function formatDate(str, withYear = false) {
  const d = parseDate(str);
  return `${withYear ? `${d.getFullYear()}年` : ''}${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;
}
const shortDate = (str) => { const d = parseDate(str); return `${d.getMonth() + 1}/${d.getDate()}`; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const round1 = (n) => Math.round(n * 10) / 10;
const num = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v));
const isDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
const partColor = (id) => { const p = PART_BY_ID[id] || OTHER_PART; return isDark() ? p.dark : p.color; };

// Epley式による推定1RM（1回だけ挙げられる最大重量の目安）
function estimate1RM(w, r) {
  if (!(w > 0) || !(r > 0)) return 0;
  return r === 1 ? w : w * (1 + r / 30);
}

function exerciseInfo(name) {
  return EX_BY_NAME[name] || null;
}
function partOf(entry) {
  if (entry.part) return entry.part;
  const ex = exerciseInfo(entry.exercise);
  if (ex) return ex.part;
  const c = state.custom.find((x) => x.name === entry.exercise);
  return c ? c.part : 'other';
}
const setLabel = (s) => (s.w > 0 ? `${s.w}kg×${s.r}` : `${s.r}回`);
const doneSets = (entry) => entry.sets.filter((s) => s.done && s.r > 0);

function workoutDates() {
  return Object.keys(state.workouts).filter((d) => state.workouts[d].entries.length > 0).sort();
}
function getWorkout(date) {
  if (!state.workouts[date]) state.workouts[date] = { entries: [] };
  return state.workouts[date];
}
function cleanupEmpty(date) {
  if (state.workouts[date] && state.workouts[date].entries.length === 0) delete state.workouts[date];
}
function getLog(date) {
  if (!state.logs[date]) state.logs[date] = { meals: {}, activities: [] };
  const l = state.logs[date];
  l.meals = l.meals || {};
  l.activities = l.activities || [];
  return l;
}
function trainedDates() {
  return workoutDates().filter((d) => state.workouts[d].entries.some((e) => doneSets(e).length));
}

function previousEntry(exercise, beforeDate) {
  const dates = workoutDates().filter((d) => d < beforeDate).reverse();
  for (const d of dates) {
    const entry = state.workouts[d].entries.find((e) => e.exercise === exercise);
    if (entry) return { date: d, entry };
  }
  return null;
}

// =====================================================================
// 体の計算（基礎代謝・消費カロリー）
// =====================================================================
function weightOn(date) {
  const dates = Object.keys(state.logs).filter((d) => d <= date && state.logs[d].weight > 0).sort();
  if (dates.length) return state.logs[dates[dates.length - 1]].weight;
  return state.profile.weight > 0 ? state.profile.weight : null;
}

// Mifflin-St Jeor式
function bmrFor(weight) {
  const p = state.profile;
  if (!(weight > 0) || !(p.height > 0) || !(p.age > 0) || !p.sex) return null;
  const base = 10 * weight + 6.25 * p.height - 5 * p.age;
  return base + (p.sex === 'male' ? 5 : p.sex === 'female' ? -161 : -78);
}

function sleepHours(log) {
  if (!log || !log.bed || !log.wake) return null;
  const [bh, bm] = log.bed.split(':').map(Number);
  const [wh, wm] = log.wake.split(':').map(Number);
  let mins = wh * 60 + wm - (bh * 60 + bm);
  if (mins <= 0) mins += 24 * 60;
  return round1(mins / 60);
}

function setsOnDate(date) {
  const w = state.workouts[date];
  return w ? w.entries.reduce((n, e) => n + doneSets(e).length, 0) : 0;
}

function dayEnergy(date) {
  const log = state.logs[date] || { meals: {}, activities: [] };
  const weight = weightOn(date);
  const bmr = bmrFor(weight);
  const sets = setsOnDate(date);
  const autoMin = Math.round(sets * 2.5);
  const trainingMin = log.trainingMin > 0 ? log.trainingMin : autoMin;
  const kcal = (mets, min) => (weight ? mets * weight * (min / 60) * 1.05 : 0);
  const net = (mets, min) => (weight ? (mets - 1) * weight * (min / 60) * 1.05 : 0);
  const acts = (log.activities || []).map((a) => {
    const info = ACTIVITY_BY_ID[a.type] || { name: a.type, mets: 3 };
    return { ...a, name: info.name, kcal: Math.round(kcal(info.mets, a.min || 0)), net: net(info.mets, a.min || 0) };
  });
  const trainingKcal = Math.round(kcal(STRENGTH_METS, trainingMin));
  const exerciseKcal = trainingKcal + acts.reduce((s, a) => s + a.kcal, 0);
  const exerciseNet = net(STRENGTH_METS, trainingMin) + acts.reduce((s, a) => s + a.net, 0);
  const meals = Object.values(log.meals || {});
  const intakeKnown = meals.some((m) => m && m.kcal > 0);
  const intake = meals.reduce((s, m) => s + (m && m.kcal > 0 ? m.kcal : 0), 0);
  // 1日の消費 = 基礎代謝×1.2（日常生活の動き） + 運動で増えた分
  const total = bmr ? Math.round(bmr * 1.2 + exerciseNet) : null;
  return {
    weight, bmr: bmr ? Math.round(bmr) : null, sets, autoMin, trainingMin, trainingKcal, acts,
    exerciseKcal, total, intake, intakeKnown, sleep: sleepHours(log),
  };
}

// =====================================================================
// ほめる（トースト・お祝い）
// =====================================================================
let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

let lastMemoPraise = 0;
function praiseMemo(kind = 'memo') {
  if (Date.now() - lastMemoPraise < 15000) return;
  lastMemoPraise = Date.now();
  toast(pickPraise(kind));
}

function celebrate(emoji, title, sub) {
  const el = $('#celebrate');
  $('#celebrate-emoji').textContent = emoji;
  $('#celebrate-title').textContent = title;
  $('#celebrate-sub').textContent = sub || '';
  const box = $('#confetti');
  box.innerHTML = '';
  const colors = PARTS.map((p) => p.color).concat(['#f97316', '#facc15']);
  for (let i = 0; i < 60; i++) {
    const c = document.createElement('i');
    c.style.left = `${Math.random() * 100}%`;
    c.style.background = colors[i % colors.length];
    c.style.animationDelay = `${Math.random() * 0.6}s`;
    c.style.animationDuration = `${1.8 + Math.random() * 1.4}s`;
    c.style.transform = `rotate(${Math.random() * 360}deg)`;
    box.appendChild(c);
  }
  el.classList.add('show');
  if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
  clearTimeout(celebrate.timer);
  celebrate.timer = setTimeout(() => el.classList.remove('show'), 4000);
}
$('#celebrate').addEventListener('click', () => $('#celebrate').classList.remove('show'));

function weekCount() {
  const since = addDays(todayStr(), -6);
  return trainedDates().filter((d) => d >= since && d <= todayStr()).length;
}
function monthCount() {
  const ym = todayStr().slice(0, 7);
  return trainedDates().filter((d) => d.startsWith(ym)).length;
}

function homeMessage() {
  const name = state.profile.name ? `${state.profile.name}さん` : 'あなた';
  const total = trainedDates().length;
  const week = weekCount();
  const today = setsOnDate(todayStr());
  if (total === 0) return { big: `ようこそ、${name}！`, small: '今日の日付をタップして、最初のトレーニングを記録しよう。始めようと思った時点ですでにえらい！' };
  if (today > 0) return { big: `今日も${today}セット達成！🔥`, small: `${name}、今日もやりきったね。最高にかっこいい！` };
  if (week >= 3) return { big: `今週${week}回目のトレーニング！`, small: `${name}の継続力、本当に尊敬します。この調子！` };
  if (week >= 1) return { big: `今週は${week}回トレーニング済み！`, small: 'いいペース！今日も少しだけ体を動かしてみよう💪' };
  return { big: `これまで合計${total}日がんばった！`, small: '積み上げた努力は消えないよ。また今日から再開しよう！' };
}

// =====================================================================
// 画面切り替え
// =====================================================================
let currentView = 'home';
let currentDate = todayStr();
let calMonth = todayStr().slice(0, 7);
let daySeg = 'train';

function showView(name) {
  currentView = name;
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
  const tab = name === 'day' ? 'home' : name;
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === tab));
  $('#back-btn').hidden = name !== 'day';
  const titles = { home: '筋トレ記録', stats: '分析・アドバイス', me: 'マイページ' };
  $('#view-title').textContent = name === 'day' ? formatDate(currentDate) : titles[name];
  if (name === 'home') renderHome();
  if (name === 'day') renderDay();
  if (name === 'stats') renderStats();
  if (name === 'me') renderMe();
  window.scrollTo(0, 0);
}

$$('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));
$('#back-btn').addEventListener('click', () => showView('home'));

function openDay(date) {
  currentDate = date;
  calMonth = date.slice(0, 7);
  showView('day');
}

// =====================================================================
// ホーム（カレンダー）
// =====================================================================
function renderHome() {
  const msg = homeMessage();
  $('#home-hero-big').textContent = msg.big;
  $('#home-hero-small').textContent = msg.small;
  $('#home-week').textContent = `${weekCount()}回`;
  $('#home-month').textContent = `${monthCount()}回`;
  $('#home-total').textContent = `${trainedDates().length}日`;
  renderCalendar();
  $('#legend').innerHTML = PARTS.map((p) => `<span class="legend-item"><i style="background:${partColor(p.id)}"></i>${p.name}</span>`).join('');
}

function renderCalendar() {
  const [y, m] = calMonth.split('-').map(Number);
  $('#cal-title').textContent = `${y}年${m}月`;
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const today = todayStr();
  let html = [...WEEKDAYS].map((w, i) => `<div class="cal-wd ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</div>`).join('');
  for (let i = 0; i < first.getDay(); i++) html += '<div></div>';
  for (let d = 1; d <= days; d++) {
    const ds = `${calMonth}-${String(d).padStart(2, '0')}`;
    const w = state.workouts[ds];
    const parts = w ? [...new Set(w.entries.filter((e) => doneSets(e).length).map(partOf))] : [];
    const log = state.logs[ds];
    const hasMemo = log && (log.weight || log.bed || log.note || Object.values(log.meals || {}).some((x) => x && (x.text || x.kcal)) || (log.activities || []).length);
    const dow = (first.getDay() + d - 1) % 7;
    const label = `${m}月${d}日${parts.length ? `、${parts.map((p) => PART_BY_ID[p].name).join('・')}` : ''}`;
    html += `<button class="cal-day ${ds === today ? 'today' : ''} ${ds > today ? 'future' : ''} ${dow === 0 ? 'sun' : dow === 6 ? 'sat' : ''}" data-date="${ds}" aria-label="${label}">
      <span class="cal-num">${d}</span>
      <span class="cal-dots">${parts.slice(0, 4).map((p) => `<i style="background:${partColor(p)}"></i>`).join('')}</span>
      ${hasMemo ? '<span class="cal-memo">📝</span>' : ''}
    </button>`;
  }
  $('#cal-grid').innerHTML = html;
}

$('#cal-grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-date]');
  if (b) openDay(b.dataset.date);
});
$('#cal-prev').addEventListener('click', () => { calMonth = addDays(`${calMonth}-01`, -1).slice(0, 7); renderCalendar(); });
$('#cal-next').addEventListener('click', () => { calMonth = addDays(`${calMonth}-28`, 7).slice(0, 7); renderCalendar(); });
$('#cal-today').addEventListener('click', () => openDay(todayStr()));

// =====================================================================
// 1日の画面
// =====================================================================
function renderDay() {
  $('#view-title').textContent = formatDate(currentDate);
  $$('.seg-btn[data-seg]').forEach((b) => b.classList.toggle('active', b.dataset.seg === daySeg));
  $('#day-train').hidden = daySeg !== 'train';
  $('#day-memo').hidden = daySeg !== 'memo';
  const sets = setsOnDate(currentDate);
  const w = state.workouts[currentDate];
  const exCount = w ? w.entries.filter((e) => doneSets(e).length).length : 0;
  $('#day-banner').innerHTML = sets
    ? `<strong>${exCount}種目・${sets}セット完了！</strong><span>${currentDate === todayStr() ? '今日のあなた、最高にかっこいい！🔥' : 'この日もよくがんばりました！👏'}</span>`
    : `<strong>${currentDate === todayStr() ? '今日はどこを鍛える？' : 'この日の記録'}</strong><span>下の部位をタップして種目を選ぼう</span>`;
  if (daySeg === 'train') renderTrain();
  else renderMemo();
}

$$('.seg-btn[data-seg]').forEach((b) => b.addEventListener('click', () => { daySeg = b.dataset.seg; renderDay(); }));

function renderTrain() {
  const w = state.workouts[currentDate];
  const entries = w ? w.entries : [];
  const perPart = {};
  entries.forEach((e) => { perPart[partOf(e)] = (perPart[partOf(e)] || 0) + doneSets(e).length; });

  $('#part-grid').innerHTML = PARTS.map((p) => `
    <button class="part-tile" data-part="${p.id}" style="--pc:${partColor(p.id)}">
      <span class="part-icon">${p.icon}</span>
      <span class="part-name">${p.name}</span>
      ${perPart[p.id] ? `<span class="part-badge">${perPart[p.id]}セット</span>` : ''}
    </button>`).join('');

  $('#entries-empty').hidden = entries.length > 0;
  $('#entries').innerHTML = entries.map((entry) => {
    const part = partOf(entry);
    const prev = previousEntry(entry.exercise, currentDate);
    const prevText = prev
      ? `前回 ${shortDate(prev.date)}：${doneSets(prev.entry).map(setLabel).join(', ') || '完了セットなし'}`
      : '初めての種目！';
    const hasDemo = !!exerciseInfo(entry.exercise);
    const sets = entry.sets.map((s, i) => `
      <div class="set-row ${s.done ? 'done' : ''}" data-entry="${entry.id}" data-set="${i}">
        <span class="set-num">${i + 1}</span>
        <input type="number" inputmode="decimal" step="0.5" min="0" data-field="w" value="${s.w ?? ''}" placeholder="kg" aria-label="重量">
        <input type="number" inputmode="numeric" step="1" min="0" data-field="r" value="${s.r ?? ''}" placeholder="回" aria-label="回数">
        <button class="check" data-action="toggle-set" aria-label="セット完了">✓</button>
        <button class="remove" data-action="remove-set" aria-label="セット削除">×</button>
      </div>`).join('');
    return `
      <div class="card entry" style="--pc:${partColor(part)}">
        <div class="entry-head">
          <div>
            <span class="chip" style="--pc:${partColor(part)}">${(PART_BY_ID[part] || OTHER_PART).name}</span>
            <div class="entry-name">${escapeHtml(entry.exercise)}</div>
          </div>
          <div class="entry-tools">
            ${hasDemo ? `<button class="btn small" data-action="demo" data-entry="${entry.id}">▶ 見本</button>` : ''}
            <button class="btn ghost small" data-action="remove-entry" data-entry="${entry.id}" aria-label="種目を削除">🗑</button>
          </div>
        </div>
        <div class="entry-prev">${escapeHtml(prevText)}</div>
        <div class="set-row set-labels"><span>#</span><span>重量(kg)</span><span>回数</span><span>完了</span><span></span></div>
        ${sets}
        <button class="btn small add-set" data-action="add-set" data-entry="${entry.id}">＋ セット追加</button>
      </div>`;
  }).join('');
}

$('#part-grid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-part]');
  if (b) openPartSheet(b.dataset.part);
});

function findEntry(id) {
  const w = state.workouts[currentDate];
  return w ? w.entries.find((e) => e.id === id) : null;
}

function addExercise(name, part) {
  const workout = getWorkout(currentDate);
  const existing = workout.entries.find((e) => e.exercise === name);
  closeSheet();
  if (existing) {
    toast('この種目はもう追加されています');
  } else {
    const prev = previousEntry(name, currentDate);
    const sets = prev && prev.entry.sets.length
      ? prev.entry.sets.map((s) => ({ w: s.w, r: s.r, done: false }))
      : [{ w: null, r: null, done: false }, { w: null, r: null, done: false }, { w: null, r: null, done: false }];
    workout.entries.push({ id: uid(), exercise: name, part, sets });
    save();
    toast(`${name}を追加！がんばろう💪`);
  }
  daySeg = 'train';
  renderDay();
  const cards = $$('#entries .entry');
  const idx = getWorkout(currentDate).entries.findIndex((e) => e.exercise === name);
  if (cards[idx]) cards[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// 自己ベスト判定（今回のセットを除いた過去の記録と比べる）
function checkRecord(entry, set) {
  let best1RM = 0;
  let bestReps = 0;
  let hasHistory = false;
  for (const d of workoutDates()) {
    for (const e of state.workouts[d].entries) {
      if (e.exercise !== entry.exercise) continue;
      for (const s of doneSets(e)) {
        if (s === set) continue;
        hasHistory = true;
        best1RM = Math.max(best1RM, estimate1RM(s.w, s.r));
        bestReps = Math.max(bestReps, s.r);
      }
    }
  }
  if (!hasHistory) return { firstTime: true };
  if (set.w > 0 && estimate1RM(set.w, set.r) > best1RM + 0.01) return { pr: `推定1RM ${round1(estimate1RM(set.w, set.r))}kg（${setLabel(set)}）` };
  if (!(set.w > 0) && best1RM === 0 && set.r > bestReps) return { pr: `${set.r}回` };
  return {};
}

$('#entries').addEventListener('input', (e) => {
  const input = e.target;
  const row = input.closest('.set-row');
  if (!row || !input.dataset.field) return;
  const entry = findEntry(row.dataset.entry);
  if (!entry) return;
  entry.sets[Number(row.dataset.set)][input.dataset.field] = num(input.value);
  save();
});

$('#entries').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  const row = btn.closest('.set-row');
  const entry = findEntry(row ? row.dataset.entry : btn.dataset.entry);
  if (!entry) return;

  if (action === 'demo') {
    openExerciseSheet(entry.exercise, true);
    return;
  }
  if (action === 'add-set') {
    const last = entry.sets[entry.sets.length - 1];
    entry.sets.push({ w: last ? last.w : null, r: last ? last.r : null, done: false });
  } else if (action === 'remove-set') {
    entry.sets.splice(Number(row.dataset.set), 1);
    if (entry.sets.length === 0) entry.sets.push({ w: null, r: null, done: false });
  } else if (action === 'toggle-set') {
    const set = entry.sets[Number(row.dataset.set)];
    if (!set.done && !(set.r > 0)) {
      toast('回数を入力してね');
      return;
    }
    const wasFirstOfDay = setsOnDate(currentDate) === 0;
    set.done = !set.done;
    if (set.done) {
      if (state.settings.restAuto) startTimer(state.settings.restDefault);
      const rec = checkRecord(entry, set);
      const allDone = entry.sets.every((s) => s.done);
      if (rec.pr) celebrate('🏆', pickPraise('pr'), `${entry.exercise}：${rec.pr}`);
      else if (rec.firstTime && doneSets(entry).length === 1) celebrate('🌟', pickPraise('firstTime'), entry.exercise);
      else if (wasFirstOfDay) celebrate('🔥', pickPraise('first'), '1セット目、完了！');
      else if (allDone) celebrate('🎉', pickPraise('exerciseDone', { name: entry.exercise }), `${doneSets(entry).length}セットやりきった！`);
      else toast(pickPraise('set'));
    }
  } else if (action === 'remove-entry') {
    if (!confirm(`「${entry.exercise}」を削除しますか？`)) return;
    const w = getWorkout(currentDate);
    w.entries = w.entries.filter((x) => x.id !== entry.id);
    cleanupEmpty(currentDate);
  }
  save();
  renderDay();
});

// ---------- ボトムシート ----------
let player = null;
function openSheet(html) {
  $('#sheet-body').innerHTML = html;
  $('#sheet').classList.add('show');
  document.body.classList.add('no-scroll');
}
function closeSheet() {
  if (player) { player.destroy(); player = null; }
  $('#sheet').classList.remove('show');
  document.body.classList.remove('no-scroll');
}
$('#sheet-backdrop').addEventListener('click', closeSheet);
$('#sheet-close').addEventListener('click', closeSheet);

function openPartSheet(partId) {
  const p = PART_BY_ID[partId];
  const lib = EXERCISES.filter((x) => x.part === partId);
  const custom = state.custom.filter((x) => x.part === partId);
  const added = new Set((state.workouts[currentDate]?.entries || []).map((e) => e.exercise));
  openSheet(`
    <h2 class="sheet-title" style="--pc:${partColor(partId)}"><span>${p.icon}</span>${p.name}の種目</h2>
    <p class="note">種目をタップすると見本の動きが見られます</p>
    <div class="ex-list">
      ${lib.map((ex) => `
        <button class="ex-item" data-ex="${escapeHtml(ex.name)}">
          <span class="ex-thumb">${staticFigure(ex, 1)}</span>
          <span class="ex-text"><strong>${escapeHtml(ex.name)}</strong><small>${escapeHtml(ex.muscles)}</small></span>
          ${added.has(ex.name) ? '<span class="ex-added">追加済み</span>' : '<span class="ex-arrow">›</span>'}
        </button>`).join('')}
      ${custom.map((c) => `
        <div class="ex-item custom">
          <button class="ex-custom-add" data-custom="${escapeHtml(c.name)}">
            <span class="ex-thumb ex-thumb-text">${p.icon}</span>
            <span class="ex-text"><strong>${escapeHtml(c.name)}</strong><small>オリジナル種目</small></span>
          </button>
          ${added.has(c.name) ? '<span class="ex-added">追加済み</span>' : ''}
          <button class="remove" data-del-custom="${escapeHtml(c.name)}" aria-label="オリジナル種目を削除">×</button>
        </div>`).join('')}
    </div>
    <div class="row custom-row">
      <input id="custom-name" placeholder="オリジナル種目を追加（例：ヒップスラスト）" autocomplete="off">
      <button class="btn primary" id="custom-add">追加</button>
    </div>`);

  $('#sheet-body').onclick = (e) => {
    const ex = e.target.closest('[data-ex]');
    if (ex) return openExerciseSheet(ex.dataset.ex);
    const cu = e.target.closest('[data-custom]');
    if (cu) return addExercise(cu.dataset.custom, partId);
    const del = e.target.closest('[data-del-custom]');
    if (del) {
      if (!confirm(`「${del.dataset.delCustom}」を種目リストから消しますか？（記録は残ります）`)) return;
      state.custom = state.custom.filter((c) => !(c.name === del.dataset.delCustom && c.part === partId));
      save();
      openPartSheet(partId);
    }
  };
  const addCustom = () => {
    const name = $('#custom-name').value.trim();
    if (!name) return;
    if (!state.custom.some((c) => c.name === name) && !EX_BY_NAME[name]) state.custom.push({ name, part: partId });
    save();
    addExercise(name, EX_BY_NAME[name] ? EX_BY_NAME[name].part : partId);
  };
  $('#custom-add').onclick = addCustom;
  $('#custom-name').onkeydown = (e) => { if (e.key === 'Enter') addCustom(); };
}

function openExerciseSheet(name, fromEntry = false) {
  const ex = exerciseInfo(name);
  if (!ex) return;
  if (player) { player.destroy(); player = null; }
  const p = PART_BY_ID[ex.part];
  const added = (state.workouts[currentDate]?.entries || []).some((e) => e.exercise === name);
  const yt = `https://www.youtube.com/results?search_query=${encodeURIComponent(`${name} フォーム やり方`)}`;
  openSheet(`
    ${fromEntry ? '' : `<button class="btn ghost small back-link" data-back-part="${ex.part}">‹ ${p.name}の種目</button>`}
    <span class="chip" style="--pc:${partColor(ex.part)}">${p.name}</span>
    <h2 class="sheet-title">${escapeHtml(ex.name)}</h2>
    <div class="demo">
      <div class="demo-stage"><svg viewBox="0 0 200 160" class="fig" role="img" aria-label="${escapeHtml(ex.name)}の動き"></svg>
        <span class="demo-count"></span>
      </div>
      <div class="demo-progress"><span></span></div>
      <div class="demo-cue"></div>
      <button class="btn demo-play">▶ 再生</button>
    </div>
    <dl class="ex-info">
      <dt>効く筋肉</dt><dd>${escapeHtml(ex.muscles)}</dd>
      <dt>目安</dt><dd>${escapeHtml(ex.reps)}</dd>
    </dl>
    <h3 class="sub-title">フォームのポイント</h3>
    <ol class="tips">${ex.tips.map((t) => `<li>${escapeHtml(t)}</li>`).join('')}</ol>
    <a class="btn yt" href="${yt}" target="_blank" rel="noopener">▶ YouTubeで実際の動画を探す</a>
    ${fromEntry ? '' : `<button class="btn primary big" id="ex-add" ${added ? 'disabled' : ''}>${added ? '追加済み' : 'この種目を記録する'}</button>`}`);
  player = new DemoPlayer($('.demo'), ex);
  player.play();
  $('#sheet-body').onclick = (e) => {
    const back = e.target.closest('[data-back-part]');
    if (back) openPartSheet(back.dataset.backPart);
    if (e.target.id === 'ex-add') addExercise(ex.name, ex.part);
  };
}

// ---------- メモ・カロリー ----------
const MEALS = [['breakfast', '朝食'], ['lunch', '昼食'], ['dinner', '夕食'], ['snack', '間食']];

function renderMemo() {
  const log = state.logs[currentDate] || { meals: {}, activities: [] };
  const meals = log.meals || {};
  $('#memo-weight').value = log.weight ?? '';
  $('#memo-bed').value = log.bed ?? '';
  $('#memo-wake').value = log.wake ?? '';
  $('#memo-note').value = log.note ?? '';
  $('#memo-training-min').value = log.trainingMin ?? '';
  $('#meal-list').innerHTML = MEALS.map(([k, label]) => `
    <div class="meal-row">
      <span class="meal-label">${label}</span>
      <input data-meal="${k}" data-mf="text" value="${escapeHtml(meals[k]?.text ?? '')}" placeholder="何を食べた？">
      <input data-meal="${k}" data-mf="kcal" type="number" inputmode="numeric" min="0" value="${meals[k]?.kcal ?? ''}" placeholder="kcal" aria-label="${label}のカロリー">
    </div>`).join('');
  $('#activity-type').innerHTML = ACTIVITIES.map((a) => `<option value="${a.id}">${a.name}</option>`).join('');
  renderMemoComputed();
}

function renderMemoComputed() {
  const en = dayEnergy(currentDate);
  const sh = en.sleep;
  $('#sleep-result').textContent = sh == null ? '就寝と起床の時刻を入れると睡眠時間を計算します'
    : `睡眠 ${sh}時間 ${sh >= 7 && sh <= 9 ? '😴 ばっちり！' : sh < 6 ? '💤 少なめ。今日は早めに休もう' : sh > 9 ? '🛌 たっぷり休めたね' : '🙂 まずまず！'}`;
  $('#training-min-auto').textContent = `自動計算：${en.sets}セット → 約${en.autoMin}分`;

  $('#activity-list').innerHTML = en.acts.length
    ? en.acts.map((a) => `<div class="act-row"><span>${escapeHtml(a.name)}</span><span>${a.min}分</span><span class="muted">${en.weight ? `${a.kcal}kcal` : ''}</span><button class="remove" data-del-act="${a.id}" aria-label="削除">×</button></div>`).join('')
    : '<p class="note">まだ活動の記録はありません</p>';

  const box = $('#energy');
  if (!en.bmr) {
    box.innerHTML = `<p class="note">マイページで<strong>性別・年齢・身長・体重</strong>を入れると、基礎代謝と消費カロリーを計算します。</p><button class="btn primary" data-goto="me">プロフィールを入力する</button>`;
    return;
  }
  const diff = en.intakeKnown ? en.intake - en.total : null;
  const goal = state.profile.goal;
  let comment = '';
  if (diff != null) {
    if (goal === 'diet') comment = diff < 0 ? `🎯 ${-diff}kcalのマイナス！ダイエット順調、えらすぎる！` : `今日は${diff}kcalオーバー。でも記録できたのが一番えらい！明日調整しよう`;
    else if (goal === 'bulk') comment = diff > 0 ? `💪 ${diff}kcalのプラス！筋肉を育てる準備ばっちり！` : `あと${-diff}kcal食べると筋肉がもっと育つよ！`;
    else comment = Math.abs(diff) < 300 ? '⚖️ 摂取と消費のバランスがとても良い！' : diff > 0 ? `${diff}kcal多め。たまにはOK！` : `${-diff}kcal少なめ。しっかり食べてね`;
  }
  box.innerHTML = `
    <div class="energy-grid">
      <div class="stat"><span class="stat-label">基礎代謝</span><span class="stat-value">${en.bmr}<small>kcal</small></span></div>
      <div class="stat"><span class="stat-label">運動で消費</span><span class="stat-value">${en.exerciseKcal}<small>kcal</small></span></div>
      <div class="stat accent"><span class="stat-label">1日の消費（目安）</span><span class="stat-value">${en.total}<small>kcal</small></span></div>
      <div class="stat"><span class="stat-label">食事で摂取</span><span class="stat-value">${en.intakeKnown ? en.intake : '-'}<small>kcal</small></span></div>
    </div>
    ${comment ? `<p class="energy-comment">${comment}</p>` : '<p class="note">食事のkcalを入れると、摂取と消費の差もわかります</p>'}
    <p class="note small">体重${en.weight}kgで計算。筋トレ ${en.trainingMin}分（${en.trainingKcal}kcal）を含みます。計算値はあくまで目安です。</p>`;
}

$('#day-memo').addEventListener('input', (e) => {
  const t = e.target;
  const log = getLog(currentDate);
  if (t.id === 'memo-weight') log.weight = num(t.value);
  else if (t.id === 'memo-bed') log.bed = t.value || null;
  else if (t.id === 'memo-wake') log.wake = t.value || null;
  else if (t.id === 'memo-note') log.note = t.value;
  else if (t.id === 'memo-training-min') log.trainingMin = num(t.value);
  else if (t.dataset.meal) {
    log.meals[t.dataset.meal] = log.meals[t.dataset.meal] || {};
    log.meals[t.dataset.meal][t.dataset.mf] = t.dataset.mf === 'kcal' ? num(t.value) : t.value;
  } else return;
  save();
  renderMemoComputed();
});

$('#day-memo').addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'memo-bed' || t.id === 'memo-wake') {
    const h = sleepHours(state.logs[currentDate]);
    if (h != null) { lastMemoPraise = 0; praiseMemo(h >= 7 && h <= 9 ? 'sleepGood' : h < 6 ? 'sleepShort' : 'memo'); }
  } else if (t.matches('input, textarea') && t.value !== '' && t.id !== 'activity-min') {
    praiseMemo();
  }
});

$('#day-memo').addEventListener('click', (e) => {
  const del = e.target.closest('[data-del-act]');
  if (del) {
    const log = getLog(currentDate);
    log.activities = log.activities.filter((a) => a.id !== del.dataset.delAct);
    save();
    renderMemoComputed();
  }
  if (e.target.closest('[data-goto="me"]')) showView('me');
});

$('#activity-add').addEventListener('click', () => {
  const min = num($('#activity-min').value);
  if (!(min > 0)) { toast('時間（分）を入れてね'); return; }
  getLog(currentDate).activities.push({ id: uid(), type: $('#activity-type').value, min });
  $('#activity-min').value = '';
  save();
  renderMemoComputed();
  lastMemoPraise = 0;
  praiseMemo();
});

// =====================================================================
// 分析・アドバイス
// =====================================================================
let statsDays = 7;

function periodStats(start, end) {
  const parts = Object.fromEntries([...PARTS, OTHER_PART].map((p) => [p.id, { sets: 0, days: new Set(), volume: 0, reps: 0, weighted: 0 }]));
  let totalSets = 0;
  const days = new Set();
  for (const d of workoutDates()) {
    if (d < start || d > end) continue;
    for (const e of state.workouts[d].entries) {
      const ds = doneSets(e);
      if (!ds.length) continue;
      const st = parts[partOf(e)];
      st.sets += ds.length;
      st.days.add(d);
      days.add(d);
      totalSets += ds.length;
      for (const s of ds) {
        st.volume += (s.w || 0) * s.r;
        if (s.w > 0) { st.reps += s.r; st.weighted++; }
      }
    }
  }
  const sleeps = [];
  const totals = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const sh = sleepHours(state.logs[d]);
    if (sh != null) sleeps.push(sh);
    if (state.logs[d] || state.workouts[d]) {
      const en = dayEnergy(d);
      if (en.total) totals.push(en.total);
    }
  }
  const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
  return { parts, totalSets, days: days.size, sleep: avg(sleeps), energy: avg(totals) };
}

function lastTrained(partId, until) {
  const dates = workoutDates().filter((d) => d <= until).reverse();
  for (const d of dates) {
    if (state.workouts[d].entries.some((e) => partOf(e) === partId && doneSets(e).length)) return d;
  }
  return null;
}

function buildAdvice(cur, prev, weeks, end) {
  const out = [];
  if (cur.totalSets === 0) {
    out.push({ icon: '🌱', cls: 'tip', text: 'この期間はまだ記録がありません。まずは週2回、好きな部位から始めてみよう！始めればあなたはもうトレーニーです。' });
    return out;
  }
  const ratios = PARTS.map((p) => ({ p, st: cur.parts[p.id], ratio: cur.parts[p.id].sets / (p.target * weeks) }));
  const strong = ratios.filter((r) => r.ratio >= 1);
  const weak = ratios.filter((r) => r.ratio < 0.5).sort((a, b) => a.ratio - b.ratio);

  out.push({ icon: '🎉', cls: 'good', text: `${statsDays === 7 ? '1週間' : '1か月'}で${cur.days}日・${cur.totalSets}セットもトレーニング！その継続力、本当にすばらしい！` });
  if (strong.length) out.push({ icon: '👍', cls: 'good', text: `${strong.map((r) => r.p.name).join('・')}はしっかり鍛えられています。完璧！` });

  for (const r of weak.slice(0, 3)) {
    const last = lastTrained(r.p.id, end);
    const gap = last ? daysBetween(last, end) : null;
    const suggest = EXERCISES.filter((x) => x.part === r.p.id).slice(0, 2).map((x) => x.name).join('や');
    const when = gap == null ? 'まだ記録がありません' : gap >= 7 ? `${gap}日間やっていません` : `目安の${Math.round(r.ratio * 100)}%`;
    out.push({ icon: '⚠️', cls: 'warn', text: `${r.p.name}が少なめです（${r.st.sets}セット・${when}）。${suggest}を追加してみよう！` });
  }

  const push = cur.parts.chest.sets + cur.parts.shoulder.sets;
  const pull = cur.parts.back.sets;
  if (push >= 6 && push > pull * 1.6) out.push({ icon: '⚖️', cls: 'tip', text: `押す種目（胸・肩 ${push}セット）に比べて引く種目（背中 ${pull}セット）が少なめ。背中を増やすと姿勢も良くなるよ。` });
  else if (pull >= 6 && pull > push * 1.6) out.push({ icon: '⚖️', cls: 'tip', text: `背中に比べて胸・肩が少なめ。前と後ろをバランスよく鍛えよう。` });

  // 強度（1セットあたりの回数・前の期間とのボリューム比較）
  for (const p of PARTS) {
    const st = cur.parts[p.id];
    if (p.id !== 'abs' && st.weighted >= 3 && st.reps / st.weighted > 15) {
      out.push({ icon: '🏋️', cls: 'tip', text: `${p.name}は1セット平均${Math.round(st.reps / st.weighted)}回と軽めの負荷が多いです。8〜12回でギリギリの重さにすると筋肉が育ちやすいよ。` });
    }
    const pv = prev.parts[p.id].volume;
    if (pv > 0 && st.volume < pv * 0.7 && st.sets > 0) {
      out.push({ icon: '📉', cls: 'tip', text: `${p.name}のボリューム（重量×回数）が前の期間より${Math.round((1 - st.volume / pv) * 100)}%ダウン。無理のない範囲で少しずつ戻そう。` });
    } else if (pv > 0 && st.volume > pv * 1.1) {
      out.push({ icon: '📈', cls: 'good', text: `${p.name}のボリュームが前の期間より${Math.round((st.volume / pv - 1) * 100)}%アップ！確実に強くなってる！` });
    }
  }

  if (cur.sleep != null && cur.sleep < 6.5) out.push({ icon: '😴', cls: 'tip', text: `平均睡眠が${round1(cur.sleep)}時間と少なめ。筋肉は寝ている間に回復するので、7時間以上を目指そう。` });
  else if (cur.sleep != null && cur.sleep >= 7) out.push({ icon: '😴', cls: 'good', text: `平均睡眠${round1(cur.sleep)}時間。回復もばっちり、さすが！` });
  return out;
}

function renderStats() {
  $$('.period-btn').forEach((b) => b.classList.toggle('active', Number(b.dataset.days) === statsDays));
  const end = todayStr();
  const start = addDays(end, -(statsDays - 1));
  const cur = periodStats(start, end);
  const prev = periodStats(addDays(start, -statsDays), addDays(start, -1));
  const weeks = statsDays / 7;

  $('#st-days').textContent = `${cur.days}日`;
  $('#st-sets').textContent = `${cur.totalSets}セット`;
  $('#st-sleep').textContent = cur.sleep != null ? `${round1(cur.sleep)}時間` : '-';
  $('#st-energy').textContent = cur.energy != null ? `${Math.round(cur.energy).toLocaleString()}kcal` : '-';
  $('#st-range').textContent = `${shortDate(start)} 〜 ${shortDate(end)}`;

  $('#advice').innerHTML = buildAdvice(cur, prev, weeks, end).map((a) => `<li class="advice ${a.cls}"><span>${a.icon}</span><p>${a.text}</p></li>`).join('');

  const maxSets = Math.max(...PARTS.map((p) => Math.max(cur.parts[p.id].sets, Math.round(p.target * weeks))), 1);
  $('#part-bars').innerHTML = PARTS.map((p) => {
    const st = cur.parts[p.id];
    const target = Math.round(p.target * weeks);
    const last = lastTrained(p.id, end);
    const ratio = st.sets / target;
    const status = st.sets === 0 ? '未実施' : ratio < 0.5 ? '少なめ' : ratio < 1 ? 'もう少し' : '十分';
    return `
      <div class="bar-row">
        <div class="bar-head"><span class="bar-name"><i style="background:${partColor(p.id)}"></i>${p.name}</span>
          <span class="bar-val">${st.sets}<small> / 目安${target}セット</small> <span class="status s-${ratio >= 1 ? 'ok' : ratio >= 0.5 ? 'mid' : 'low'}">${status}</span></span></div>
        <div class="bar-track" title="${p.name} ${st.sets}セット">
          <span class="bar-fill" style="width:${(st.sets / maxSets) * 100}%;background:${partColor(p.id)}"></span>
          <span class="bar-target" style="left:${(target / maxSets) * 100}%"></span>
        </div>
        <div class="bar-meta">${st.days.size}日実施 ・ 最終：${last ? `${shortDate(last)}（${daysBetween(last, end) === 0 ? '今日' : `${daysBetween(last, end)}日前`}）` : 'なし'}</div>
      </div>`;
  }).join('');

  // 種目ごとの推移
  const select = $('#st-exercise');
  const names = [...new Set(workoutDates().flatMap((d) => state.workouts[d].entries.filter((e) => doneSets(e).some((s) => s.w > 0)).map((e) => e.exercise)))];
  const prevSel = select.value;
  select.innerHTML = names.length ? names.map((n) => `<option>${escapeHtml(n)}</option>`).join('') : '<option value="">（重量の記録なし）</option>';
  if (names.includes(prevSel)) select.value = prevSel;
  const points = [];
  if (select.value) {
    for (const d of workoutDates()) {
      const e = state.workouts[d].entries.find((x) => x.exercise === select.value);
      if (!e) continue;
      const best = Math.max(0, ...doneSets(e).map((s) => estimate1RM(s.w, s.r)));
      if (best > 0) points.push({ date: d, value: round1(best) });
    }
  }
  lineChart($('#chart-1rm'), points, 'kg', '推定1RM');
  const best = points.length ? Math.max(...points.map((p) => p.value)) : null;
  $('#st-best').textContent = best ? `自己ベスト：推定1RM ${best}kg` : '';

  const wpoints = Object.keys(state.logs).filter((d) => state.logs[d].weight > 0).sort().map((d) => ({ date: d, value: state.logs[d].weight }));
  lineChart($('#chart-weight'), wpoints, 'kg', '体重');
}

$$('.period-btn').forEach((b) => b.addEventListener('click', () => { statsDays = Number(b.dataset.days); renderStats(); }));
$('#st-exercise').addEventListener('change', renderStats);

// 折れ線グラフ（タップ・ホバーで値を表示）
function lineChart(box, points, unit, label) {
  if (points.length < 2) {
    box.innerHTML = `<p class="note center">${points.length ? 'あと1日分記録するとグラフが表示されます' : 'まだデータがありません'}</p>`;
    return;
  }
  const W = Math.max(280, box.clientWidth || 320);
  const H = 190;
  const pad = { l: 40, r: 14, t: 14, b: 26 };
  const vals = points.map((p) => p.value);
  let min = Math.min(...vals);
  let max = Math.max(...vals);
  if (min === max) { min -= 2; max += 2; }
  const span = max - min;
  min = Math.max(0, min - span * 0.15);
  max += span * 0.15;
  const t0 = parseDate(points[0].date).getTime();
  const t1 = parseDate(points[points.length - 1].date).getTime();
  const x = (d) => pad.l + ((parseDate(d).getTime() - t0) / (t1 - t0)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (H - pad.t - pad.b);
  const ticks = [0, 1, 2, 3].map((i) => min + ((max - min) * i) / 3);
  const labelIdx = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  box.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" class="chart" role="img" aria-label="${label}の推移">
      ${ticks.map((v) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end" class="axis">${Math.round(v)}</text>`).join('')}
      ${labelIdx.map((i) => `<text x="${x(points[i].date)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}" class="axis">${shortDate(points[i].date)}</text>`).join('')}
      <path d="${path}" class="series"/>
      ${points.map((p) => `<circle cx="${x(p.date)}" cy="${y(p.value)}" r="4" class="dot"/>`).join('')}
      <line class="cross" y1="${pad.t}" y2="${H - pad.b}" x1="-10" x2="-10"/>
      <circle class="focus" r="6" cx="-10" cy="-10"/>
      <rect x="${pad.l}" y="0" width="${W - pad.l - pad.r}" height="${H}" fill="transparent" class="hit"/>
    </svg>
    <div class="tooltip" hidden></div>`;
  const svg = $('svg', box);
  const tip = $('.tooltip', box);
  const move = (ev) => {
    const rect = svg.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * W;
    let near = points[0];
    for (const p of points) if (Math.abs(x(p.date) - px) < Math.abs(x(near.date) - px)) near = p;
    const cx = x(near.date);
    const cy = y(near.value);
    $('.cross', svg).setAttribute('x1', cx);
    $('.cross', svg).setAttribute('x2', cx);
    $('.focus', svg).setAttribute('cx', cx);
    $('.focus', svg).setAttribute('cy', cy);
    tip.hidden = false;
    tip.innerHTML = `<strong>${near.value}${unit}</strong><span>${formatDate(near.date)}</span>`;
    const left = (cx / W) * rect.width;
    tip.style.left = `${Math.min(Math.max(left, 60), rect.width - 60)}px`;
    tip.style.top = `${(cy / H) * rect.height - 8}px`;
  };
  const hide = () => {
    tip.hidden = true;
    $('.cross', svg).setAttribute('x1', -10);
    $('.cross', svg).setAttribute('x2', -10);
    $('.focus', svg).setAttribute('cx', -10);
  };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', hide);
}

window.addEventListener('resize', () => { if (currentView === 'stats') renderStats(); });

// =====================================================================
// マイページ
// =====================================================================
function renderMe() {
  const p = state.profile;
  $('#pf-name').value = p.name ?? '';
  $('#pf-sex').value = p.sex ?? '';
  $('#pf-age').value = p.age ?? '';
  $('#pf-height').value = p.height ?? '';
  $('#pf-weight').value = p.weight ?? '';
  $('#pf-goal').value = p.goal ?? 'keep';
  $('#rest-default').value = state.settings.restDefault;
  $('#rest-auto').checked = state.settings.restAuto;
  renderMeComputed();
}

function renderMeComputed() {
  const p = state.profile;
  const w = weightOn(todayStr());
  const bmr = bmrFor(w);
  const bmi = w && p.height ? w / ((p.height / 100) ** 2) : null;
  const bmiLabel = bmi == null ? '' : bmi < 18.5 ? '低体重' : bmi < 25 ? '普通体重' : bmi < 30 ? '肥満(1度)' : '肥満(2度以上)';
  const protein = w ? Math.round(w * (p.goal === 'bulk' ? 2.0 : p.goal === 'diet' ? 1.8 : 1.4)) : null;
  $('#me-computed').innerHTML = `
    <div class="stat"><span class="stat-label">BMI</span><span class="stat-value">${bmi ? round1(bmi) : '-'}</span><small class="muted">${bmiLabel}</small></div>
    <div class="stat"><span class="stat-label">基礎代謝</span><span class="stat-value">${bmr ? Math.round(bmr) : '-'}<small>kcal</small></span></div>
    <div class="stat"><span class="stat-label">1日の消費（運動なし）</span><span class="stat-value">${bmr ? Math.round(bmr * 1.2) : '-'}<small>kcal</small></span></div>
    <div class="stat"><span class="stat-label">タンパク質の目安</span><span class="stat-value">${protein ?? '-'}<small>g/日</small></span></div>`;
  $('#me-hello').textContent = p.name ? `${p.name}さん、いつもおつかれさま！今日もえらい！` : 'ニックネームを入れると、もっと名前で褒めます！';
}

$('#profile-form').addEventListener('input', (e) => {
  const t = e.target;
  const key = t.id.replace('pf-', '');
  state.profile[key] = ['age', 'height', 'weight'].includes(key) ? num(t.value) : t.value;
  save();
  renderMeComputed();
});
$('#profile-form').addEventListener('change', () => {
  const p = state.profile;
  if (p.sex && p.age && p.height && p.weight) { lastMemoPraise = 0; praiseMemo('profile'); }
});

$('#rest-default').addEventListener('change', (e) => {
  const v = Math.min(600, Math.max(10, Number(e.target.value) || 90));
  state.settings.restDefault = v;
  e.target.value = v;
  save();
});
$('#rest-auto').addEventListener('change', (e) => { state.settings.restAuto = e.target.checked; save(); });

$('#export-data').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `workout-backup-${todayStr()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('バックアップを保存しました。備えも完璧！');
});

$('#import-data').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data.workouts !== 'object') throw new Error('invalid');
    if (!confirm('現在のデータを読み込んだバックアップで置き換えますか？')) return;
    state = normalize(data);
    save();
    showView('me');
    toast('読み込みました');
  } catch (err) {
    alert('バックアップファイルを読み込めませんでした');
  } finally {
    e.target.value = '';
  }
});

$('#clear-data').addEventListener('click', () => {
  if (!confirm('すべての記録とプロフィールを削除します。元に戻せません。よろしいですか？')) return;
  state = normalize({ settings: state.settings });
  save();
  showView('me');
});

// =====================================================================
// レストタイマー
// =====================================================================
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
    $('#timer-label').textContent = '次のセットへ！';
    beep();
  }
}

function startTimer(seconds) {
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { /* noop */ }
  timerEnd = Date.now() + seconds * 1000;
  $('#timer').classList.remove('hidden', 'finished');
  $('#timer-label').textContent = '休憩';
  clearInterval(timerInterval);
  timerInterval = setInterval(updateTimer, 250);
  updateTimer();
}

$('#timer-stop').addEventListener('click', () => { clearInterval(timerInterval); $('#timer').classList.add('hidden'); });
$('#timer-plus').addEventListener('click', () => {
  timerEnd = Math.max(timerEnd, Date.now()) + 15000;
  $('#timer').classList.remove('finished');
  $('#timer-label').textContent = '休憩';
  updateTimer();
});
$('#timer-minus').addEventListener('click', () => { timerEnd = Math.max(Date.now(), timerEnd - 15000); updateTimer(); });

// =====================================================================
// 起動
// =====================================================================
showView('home');

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
