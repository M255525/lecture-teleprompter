/* 講師現場提詞器：畫面
   localStorage（tp. 前綴）：plan（編輯中的課程）、plans（我的課程，最多 30）、live（上課中狀態＋開始時的課程快照，重新整理可以接著計時）、
   last（最近一次的課後報告來源）、view、lfs（上課字級）、light、sound、fs、fold、warnSeen、marquee。 */
(function(){
'use strict';
var T = window.TP;
var PFX = 'tp.', MIN = T.MIN;
var $ = function(id){ return document.getElementById(id); };
function lsGet(k){ try{ return localStorage.getItem(PFX + k); }catch(e){ return null; } }
function lsSet(k, v){ try{ localStorage.setItem(PFX + k, v); return true; }catch(e){ return false; } }
function lsDel(k){ try{ localStorage.removeItem(PFX + k); }catch(e){} }
function lsJson(k, d){ try{ var v = JSON.parse(lsGet(k)); return v == null ? d : v; }catch(e){ return d; } }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]; }); }
var standalone = window.matchMedia && matchMedia('(display-mode: standalone)').matches;
var OFFSET = 0; // 測試用：快轉時間
function now(){ return Date.now() + OFFSET; }

/* ---------- 狀態 ---------- */
var firstRun = !lsGet('plan');
var P = T.normalize(lsJson('plan', null));
var PLANS = lsJson('plans', []);
var LIVE = lsJson('live', null);       // {plan, st}
var LAST = lsJson('last', null);       // {plan, st}
var VIEW = lsGet('view') || 'edit';
var OPENSEG = {};
function save(){ lsSet('plan', JSON.stringify(P)); }
function saveLive(){ if(LIVE) lsSet('live', JSON.stringify(LIVE)); else lsDel('live'); }

var toastT;
function toast(s){ var t = document.querySelector('.toast'); if(!t){ t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); } t.textContent = s; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(function(){ t.hidden = true; }, 2600); }
function openModal(h){ $('modalBox').innerHTML = h; $('modal').classList.add('show'); }
function closeModal(){ $('modal').classList.remove('show'); }
function download(blob, name){ var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1500); }
function safeName(s){ return String(s || '課程').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 30) || '課程'; }
function copyText(t, msg){
  function fb(){ var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try{ document.execCommand('copy'); }catch(e){} ta.remove(); }
  if(navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(t).catch(fb); else fb();
  toast(msg || '已複製');
}
function tc(type){ return T.TYPES[type] ? T.TYPES[type].c : '#6EA8FE'; }

/* ---------- 共用外框 ---------- */
function render(){
  document.body.classList.toggle('live', VIEW === 'live' && !!LIVE);
  document.body.classList.toggle('light-live', lsGet('light') === '1');
  if(VIEW === 'live' && LIVE){ renderLive(); return; }
  if(VIEW === 'live') VIEW = 'edit';
  var h = '<div class="top"><h1><span class="tally" aria-hidden="true"></span><span>講師現場提詞器 <small>排課・上課倒數・落後時建議刪減・課後時間報告</small></span></h1>' +
    '<a class="ibtn" href="manual.html">📖 操作手冊</a><button class="ibtn" type="button" data-act="settings" aria-label="常用設定">⚙</button></div>' +
    '<p class="warn-line">課程與上課紀錄只存在這台裝置；上課時請讓平板接上電源。<button type="button" data-act="warn">⚠ 使用警語</button></p>' +
    '<div class="modes" role="tablist">' + [['edit', '📝 排課'], ['live', '🎬 上課'], ['report', '📊 課後報告']].map(function(m){ return '<button type="button" class="mode" role="tab" data-view="' + m[0] + '" aria-selected="' + (VIEW === m[0]) + '">' + m[1] + '</button>'; }).join('') + '</div>' +
    '<div id="body"></div>' + footer();
  $('app').innerHTML = h;
  if(VIEW === 'report') renderReport(); else renderEdit();
}
function footer(){
  return '<footer class="foot2">👤 創作者 Mark Tsai（蔡豐全）<a href="mailto:tsaimark@gmail.com">tsaimark@gmail.com</a><br><a href="manual.html">📖 操作手冊</a><a href="manual.html#creator">👤 創作者資訊</a><a href="#" data-act="warn">⚠ 使用警語</a>' +
    (standalone ? '' : '<a href="#" data-act="install">📲 加入主畫面</a>') +
    '<br><img src="https://visitor-badge.laobi.icu/badge?page_id=m255525.lectureteleprompter" alt="訪客次數" height="20" loading="lazy" style="vertical-align:middle;margin-top:.4rem"></footer>';
}

/* ---------- 課程專案（course-link.js；沒有也照常運作）：只讀課程名稱、上課時段、大綱，不碰學員 ---------- */
var MK = window.MKCourse && window.MKCourse.store ? window.MKCourse : null, MKD = null;
function mkHM(v){ return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? v : ''; }
function mkSess(d){ return (Array.isArray(d.course.sessions) ? d.course.sessions : []).filter(function(x){ return x && mkHM(x.start) && mkHM(x.end); }).slice(0, 60); }
function mkPickHtml(){
  var list = MK.store.list();
  return '<h2>📥 從課程專案帶入</h2><p class="small">課程專案是同一台電腦上各辦訓工具共用的課程資料（課程招生海報產生器、出席簽到 QR…）。可以帶入課程名稱、某一堂的上課時間，或用海報上的課程大綱建立段落。</p>' +
    (list.length ? '<div class="plist">' + list.map(function(d){ return '<div class="pitem"><b>' + esc(MKCourse.label(d)) + '</b><small>' + esc(MKCourse.when(d)) + '</small><button type="button" class="btn sm go" data-mkin="' + esc(d.id) + '">選這個</button></div>'; }).join('') + '</div>' : '<p>這台電腦還沒有課程專案。</p>') +
    '<div class="stack"><label class="btn">📂 開啟課程專案檔（.json）<input type="file" id="mkFile" accept=".json,application/json" hidden></label><button type="button" class="btn" data-act="close">取消</button></div>';
}
function mkAsk(id){
  var d = MK.store.get(id); if(!d){ toast('找不到這個課程專案'); return; }
  MKD = d;
  var ss = mkSess(d), ol = String(d.course.outline || '').trim();
  openModal('<h2>📥 ' + esc(d.course.title || '課程專案') + '</h2><p class="small">排課名稱會改成課程名稱。</p>' +
    (ss.length ? '<label class="fld">上課時間（出席簽到 QR 的堂次）<select id="mkSess"><option value="">不改開始／結束時間</option>' + ss.map(function(x, i){ return '<option value="' + i + '">' + esc((x.title ? x.title + '　' : '') + (x.date || '') + ' ' + x.start + '–' + x.end) + '</option>'; }).join('') + '</select></label>' : '<p class="small">課程專案裡沒有堂次時間（在出席簽到 QR 按「📤 存到課程專案」就會有）。</p>') +
    (ol ? '<label class="chk"><input type="checkbox" id="mkOl"' + (P.segs.length ? '' : ' checked') + '> 用課程大綱建立段落（取代目前 ' + P.segs.length + ' 段）</label><pre class="small" style="white-space:pre-wrap;max-height:8rem;overflow:auto">' + esc(ol.slice(0, 600)) + '</pre>' : '<p class="small">課程專案裡沒有課程大綱（在課程招生海報產生器填大綱再存成課程專案就會有）。</p>') +
    '<div class="stack"><button type="button" class="btn go" data-act="mkOk">帶入</button><button type="button" class="btn" data-act="close">取消</button></div>');
}
function mkApply(){
  var d = MKD; if(!d) return;
  var np = T.clone(P), si = $('mkSess') ? $('mkSess').value : '', ss = mkSess(d), useOl = $('mkOl') && $('mkOl').checked, parts = [];
  if(d.course.title){ np.name = (d.course.title + (d.course.term ? ' ' + d.course.term : '')).slice(0, 60); parts.push('名稱'); }
  if(si !== '' && ss[+si]){ np.start = ss[+si].start; np.end = ss[+si].end; parts.push('時間 ' + np.start + '–' + np.end); }
  if(useOl){ var segs = T.parseOutline(String(d.course.outline || '')); if(segs.length){ np.segs = segs; parts.push(segs.length + ' 個段落'); } }
  closeModal(); setPlan(np, '已帶入' + parts.join('、') + (useOl ? '，請補上休息與互動' : ''));
}

/* ---------- 排課 ---------- */
function ipcCourses(){ try{ var s = JSON.parse(localStorage.getItem('ipc.state')); return s && Array.isArray(s.courses) ? s.courses.filter(function(c){ return c && c.name && c.outline; }) : []; }catch(e){ return []; } }
function segHtml(s, i, row){
  var ty = T.TYPES[s.type];
  return '<div class="seg" style="--tc:' + tc(s.type) + '" data-i="' + i + '"><div class="row">' +
    '<div class="no"><b>' + (i + 1) + '</b>' + T.hmText(row.s) + '</div>' +
    '<input data-s="t" value="' + esc(s.t) + '" placeholder="段落標題" aria-label="第 ' + (i + 1) + ' 段標題">' +
    '<div class="mins"><input data-s="min" type="number" min="1" max="600" step="1" inputmode="numeric" value="' + s.min + '" aria-label="分鐘"><span class="small">分</span></div>' +
    '<select data-s="type" aria-label="類型">' + T.TYPE_KEYS.map(function(k){ return '<option value="' + k + '"' + (s.type === k ? ' selected' : '') + '>' + T.TYPES[k].ic + ' ' + T.TYPES[k].n + '</option>'; }).join('') + '</select>' +
    '<div class="tools"><button type="button" class="mini" data-mv="-1" aria-label="往上"' + (i ? '' : ' disabled') + '>↑</button><button type="button" class="mini" data-mv="1" aria-label="往下"' + (i < P.segs.length - 1 ? '' : ' disabled') + '>↓</button><button type="button" class="mini" data-ins aria-label="在下面插入一段">＋</button><button type="button" class="mini" data-del aria-label="刪除">✕</button></div></div>' +
    '<details' + (OPENSEG[i] ? ' open' : '') + ' data-od="' + i + '"><summary>要點與講稿' + (s.pts ? '（' + T.lines(s.pts).length + ' 點）' : '') + '<label onclick="event.stopPropagation()"><input type="checkbox" data-s="opt"' + (s.opt ? ' checked' : '') + '>可刪減（落後時優先砍）</label></summary>' +
    '<div class="two"><label class="fld">要點（一行一點，上課時大字顯示）<textarea data-s="pts" rows="3">' + esc(s.pts) + '</textarea></label><label class="fld">講稿備註（只有你看得到）<textarea data-s="note" rows="3">' + esc(s.note) + '</textarea></label></div></details></div>';
}
function timelineHtml(sc){
  return '<div class="tl">' + P.segs.map(function(s, i){ var r = sc.rows[i]; return '<div class="it"><div class="tm">' + T.hmText(r.s) + '</div><div class="bx" style="--tc:' + tc(s.type) + ';min-height:' + Math.max(1.6, s.min / 6) + 'rem"><b>' + esc(s.t || '（未命名）') + '</b><small>' + s.min + ' 分' + (s.opt ? '・可刪' : '') + '</small></div></div>'; }).join('') +
    '<div class="it"><div class="tm">' + T.hmText(sc.endAt) + '</div><div class="end">下課' + (sc.avail != null ? (sc.diff ? '（表定 ' + esc(P.end) + '，' + (sc.diff > 0 ? '超時 ' + sc.diff : '提早 ' + (-sc.diff)) + ' 分）' : '（剛好）') : '') + '</div></div></div>';
}
function checksHtml(){
  var c = T.checks(P);
  if(!c.length) c = [{lv:'ok', t:'時間分配看起來沒問題'}];
  return '<ul class="chk">' + c.map(function(x){ return '<li class="' + x.lv + '">' + esc(x.t) + '</li>'; }).join('') + '</ul>';
}
function renderEdit(){
  var sc = T.schedule(P), ipc = ipcCourses();
  var h = '<div class="work"><div class="col">' +
    (LIVE ? '<div class="card" style="border-color:var(--red)"><h2>🔴 上課中：' + esc(LIVE.plan.name || '未命名課程') + '</h2><div class="stack"><button type="button" class="btn go" data-view="live">回到上課畫面</button><button type="button" class="btn red" data-act="endAsk">結束這堂課</button></div></div>' : '') +
    '<div class="card"><h2>課程設定</h2><div class="grid4"><label class="fld">課程名稱<input data-p="name" value="' + esc(P.name) + '" placeholder="例：AI 工具入門"></label><label class="fld">開始時間<input data-p="start" type="time" value="' + esc(P.start) + '"></label><label class="fld">表定下課（選填）<input data-p="end" type="time" value="' + esc(P.end) + '"></label></div>' +
      '<div class="grid3" style="margin-top:.55rem"><label class="fld">段落結束前幾分鐘變色<input data-p="warn" type="number" min="0" max="30" inputmode="numeric" value="' + P.warn + '"></label><label class="fld">連續講授幾分鐘提醒互動<input data-p="talkMax" type="number" min="0" max="120" inputmode="numeric" value="' + P.talkMax + '"><span class="hint">0＝不提醒</span></label><label class="fld">落後幾分鐘開始建議刪減<input data-p="lateTh" type="number" min="1" max="60" inputmode="numeric" value="' + P.lateTh + '"></label></div></div>' +
    '<div class="card"><h2>段落<span class="r">' + P.segs.length + ' 段・共 ' + T.durText(sc.total) + '</span></h2><div class="segs" id="segs">' + P.segs.map(function(s, i){ return segHtml(s, i, sc.rows[i]); }).join('') + '</div>' +
      '<div class="stack" style="margin-top:.6rem"><button type="button" class="btn" data-act="addSeg">＋ 新增段落</button><button type="button" class="btn" data-act="paste">📋 貼上大綱</button>' + (ipc.length ? '<button type="button" class="btn" data-act="fromIpc">🎓 從講師型錄帶入</button>' : '') + (MK ? '<button type="button" class="btn" data-act="mkPick">📥 從課程專案帶入</button>' : '') + '</div></div>' +
    '<div class="card"><h2>範例與我的課程</h2><div class="exs">' + T.EXAMPLES.map(function(e){ return '<button type="button" class="ex" data-ex="' + e.id + '">' + esc(e.n) + '<small>' + esc(e.d) + '（虛構）</small></button>'; }).join('') + '</div>' +
      '<div class="stack" style="margin:.6rem 0 .4rem"><button type="button" class="btn" data-act="savePlan">💾 存到我的課程</button><button type="button" class="btn" data-act="newPlan">＋ 新的空白課程</button><button type="button" class="btn" data-act="exportPlans">⬇ 匯出</button><label class="btn" style="cursor:pointer">⬆ 匯入<input type="file" accept=".json,application/json" data-file="plans" hidden></label></div>' +
      (PLANS.length ? '<div class="plist">' + PLANS.map(function(x, i){ return '<div class="pitem"><b>' + esc(x.name) + '</b><span class="small">' + T.durText(T.total(T.normalize(x.plan))) + '</span><button type="button" class="btn sm" data-load="' + i + '">開啟</button><button type="button" class="mini" data-delplan="' + i + '" aria-label="刪除">✕</button></div>'; }).join('') + '</div>' : '<p class="small">還沒有存檔。排好的課程按「存到我的課程」，下次直接開啟。</p>') + '</div>' +
    '</div><div class="col" style="position:sticky;top:calc(var(--mq) + .6rem)">' +
    '<button type="button" class="btn go big" data-act="start"' + (P.segs.length ? '' : ' disabled') + '>' + (LIVE ? '🎬 回到上課畫面' : '▶ 開始上課') + '</button>' +
    '<div class="card"><h2>排課檢查</h2><div id="checks">' + checksHtml() + '</div></div>' +
    '<div class="card"><h2>時間軸<span class="r"><button type="button" class="btn sm" data-act="print">🖨 列印時間表</button></span></h2><div class="legend" style="margin-bottom:.5rem">' + T.TYPE_KEYS.map(function(k){ return '<span><i style="background:' + tc(k) + '"></i>' + T.TYPES[k].n + '</span>'; }).join('') + '</div><div id="tl">' + timelineHtml(sc) + '</div></div>' +
    '</div></div>';
  $('body').innerHTML = h;
}
function refreshSide(){
  var sc = T.schedule(P);
  if($('tl')) $('tl').innerHTML = timelineHtml(sc);
  if($('checks')) $('checks').innerHTML = checksHtml();
  document.querySelectorAll('.seg').forEach(function(el, i){ var r = sc.rows[i]; if(r){ el.querySelector('.no').innerHTML = '<b>' + (i + 1) + '</b>' + T.hmText(r.s); el.style.setProperty('--tc', tc(P.segs[i].type)); } });
  var hd = document.querySelector('#segs') && document.querySelector('#segs').parentNode.querySelector('h2 .r'); if(hd) hd.textContent = P.segs.length + ' 段・共 ' + T.durText(sc.total);
}

/* ---------- 上課 ---------- */
var lastIdx = -2, lastPhase = '', cutHide = 0, nudgeHide = -1, railSure = -1, tickT = null, wake = null;
function L(){ return LIVE.st; }
function LP(){ return LIVE.plan; }
function startLive(){
  if(!P.segs.length){ toast('請先新增段落'); return; }
  if(!LIVE){ LIVE = {plan:T.clone(P), st:T.startLive(P, now())}; saveLive(); if(LIVE.st.rel) setTimeout(function(){ toast('現在時間和表定開始差很多，預計下課改用「現在開始」計算'); }, 300); }
  VIEW = 'live'; lsSet('view', VIEW); lastIdx = -2; cutHide = 0; render(); requestWake();
}
function requestWake(){ try{ if('wakeLock' in navigator && !wake) navigator.wakeLock.request('screen').then(function(w){ wake = w; w.addEventListener('release', function(){ wake = null; }); }).catch(function(){}); }catch(e){} }
document.addEventListener('visibilitychange', function(){ if(document.visibilityState === 'visible' && VIEW === 'live' && LIVE) requestWake(); });
function deltaChip(d){ return d > 0 ? ['bad', '落後 ' + d + ' 分'] : d < 0 ? ['ok', '超前 ' + (-d) + ' 分'] : ['ok', '準時']; }
function renderLive(){
  var p = LP(), st = L(), s = T.status(p, st, now());
  if(s.done){ finishLive(); return; }
  var seg = s.seg, ty = T.TYPES[seg.type], nx = s.next >= 0 ? p.segs[s.next] : null;
  var pts = T.lines(seg.pts), showNote = lsGet('note') !== '0';
  var h = '<div class="stage"><div class="lbar"><span class="clk" id="lClk">--:--</span><span class="cn">' + esc(p.name || '上課中') + '</span>' +
    '<span class="ends">表定下課 <b>' + T.clock(st.plannedEnd) + '</b>' + (st.rel ? '（依實際開始）' : '') + '<br>預計 <b id="lProj">--:--</b></span><span class="chip" id="lChip"></span>' +
    '<button type="button" class="btn sm" data-act="fullscreen">⛶ 全螢幕</button><button type="button" class="btn sm" data-view="edit">📝 排課</button></div>' +
    '<div class="lmain"><div class="col"><div class="now" id="lNow" style="--tc:' + tc(seg.type) + '"><div class="meta"><span>' + ty.ic + ' ' + ty.n + '</span><span>第 ' + (s.i + 1) + ' / ' + p.segs.length + ' 段</span><span>排 ' + T.segMin(p, st, s.i) + ' 分' + (st.adj[s.i] ? '（已調整 ' + (st.adj[s.i] > 0 ? '+' : '') + st.adj[s.i] + '）' : '') + '</span>' + (seg.opt ? '<span class="opt-tag">可刪減</span>' : '') + '</div>' +
      '<div class="tt">' + esc(seg.t || '（未命名段落）') + '</div><div class="cdrow"><div class="cd" id="lCd">0:00</div><div class="cdl" id="lCdl">剩餘</div></div><div class="prog"><i id="lProg"></i></div>' +
      (pts.length ? '<ul class="pts">' + pts.map(function(x){ return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' : '') +
      (seg.note && showNote ? '<div class="note">' + esc(seg.note) + '</div>' : '') + '</div>' +
      '<div id="lBan"></div></div>' +
    '<div class="side">' + (nx ? '<div class="nxt" style="--tc:' + tc(nx.type) + '"><div class="l">下一段・' + T.TYPES[nx.type].ic + ' ' + T.TYPES[nx.type].n + '・' + T.segMin(p, st, s.next) + ' 分</div><div class="t">' + esc(nx.t || '（未命名）') + '</div>' + (T.lines(nx.pts).length ? '<div class="m">' + esc(T.lines(nx.pts).slice(0, 3).join('・')) + '</div>' : '') + '</div>' : '<div class="nxt" style="--tc:var(--green)"><div class="l">下一段</div><div class="t">🏁 這是最後一段</div><div class="m">按「下一段」就結束並產生課後報告</div></div>') +
      '<div class="rail" id="lRail"><p class="small" style="padding:0 .3rem .2rem">表定時間・點兩下可跳到該段</p>' + railHtml(p, st) + '</div></div></div>' +
    '<div class="lmore"><button type="button" class="btn sm" data-act="skipCur">⏭ 刪掉這段直接下一段</button><button type="button" class="btn sm" data-act="noteToggle">' + (showNote ? '🙈 隱藏講稿' : '📝 顯示講稿') + '</button><button type="button" class="btn sm red" data-act="endAsk">⏹ 結束課程</button><span class="small" style="align-self:center">簡報筆／鍵盤：<kbd>PageDown</kbd> <kbd>→</kbd> 下一段・<kbd>PageUp</kbd> <kbd>←</kbd> 上一段・<kbd>.</kbd> <kbd>B</kbd> <kbd>空白</kbd> 暫停・<kbd>+</kbd> <kbd>-</kbd> 調時間</span></div>' +
    '<div class="ctl"><button type="button" data-act="prev">◀ 上一段</button><button type="button" data-act="minus">−1 分</button><button type="button" class="ps" data-act="pause" aria-pressed="' + s.paused + '">' + (s.paused ? '▶ 繼續' : '⏸ 暫停') + '</button><button type="button" data-act="plus">＋1 分</button><button type="button" class="nx" data-act="next">' + (nx ? '下一段 ▶' : '結束 🏁') + '</button></div></div>';
  $('app').innerHTML = h;
  lastIdx = s.i; lastPhase = ''; banKey = ''; tick();
}
function railHtml(p, st){
  var t0 = st.startedAt, acc = 0, html = '';
  var base = st.rel ? st.startedAt : st.plannedEnd - (function(){ var e = T.hm(p.end), s0 = T.hm(p.start); return (e != null ? (e - s0 + 1440) % 1440 : T.total(p)) * MIN; })();
  p.segs.forEach(function(s, i){
    var ran = st.log.some(function(l){ return l.i === i; }), cls = i === st.idx ? 'cur' : st.skip[i] ? 'skip' : ran ? 'done' : '';
    html += '<button type="button" class="' + cls + (railSure === i ? ' sure' : '') + '" data-jump="' + i + '" style="--tc:' + tc(s.type) + '"><span class="tm">' + T.clock(base + acc * MIN) + '</span><span>' + esc(s.t || '（未命名）') + (railSure === i ? '　← 再按一次跳到這段' : '') + '</span><span class="tm">' + T.segMin(p, st, i) + '分</span></button>';
    if(!st.skip[i]) acc += T.segMin(p, st, i);
  });
  return html;
}
var beeped = {};
function beep(kind){
  if(lsGet('sound') === '0') return;
  try{
    var A = window._ac || (window._ac = new (window.AudioContext || window.webkitAudioContext)()), t = A.currentTime;
    [0, .22].slice(0, kind === 'over' ? 2 : 1).forEach(function(d){ var o = A.createOscillator(), g = A.createGain(); o.frequency.value = kind === 'over' ? 660 : 880; g.gain.setValueAtTime(.0001, t + d); g.gain.exponentialRampToValueAtTime(.25, t + d + .02); g.gain.exponentialRampToValueAtTime(.0001, t + d + .18); o.connect(g).connect(A.destination); o.start(t + d); o.stop(t + d + .2); });
    if(navigator.vibrate) navigator.vibrate(kind === 'over' ? [150, 80, 150] : 120);
  }catch(e){}
}
function tick(){
  if(VIEW !== 'live' || !LIVE || !$('lCd')) return;
  var p = LP(), st = L(), n = now(), s = T.status(p, st, n);
  if(s.done){ finishLive(); return; }
  if(s.i !== lastIdx){ renderLive(); return; }
  $('lClk').textContent = (function(d){ return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2); })(new Date(n));
  $('lCd').textContent = T.mmss(s.remain);
  $('lCdl').textContent = s.paused ? '⏸ 暫停中' : s.remain < 0 ? '已超時' : '剩餘';
  $('lProg').style.width = (s.pct * 100).toFixed(1) + '%';
  $('lProj').textContent = T.clock(s.proj);
  var c = deltaChip(s.delta), chip = $('lChip'); chip.className = 'chip ' + (s.delta >= p.lateTh ? 'bad' : s.delta > 0 ? 'warn' : 'ok'); chip.textContent = c[1];
  var nowEl = $('lNow'); nowEl.classList.toggle('warn', s.phase === 'warn'); nowEl.classList.toggle('over', s.phase === 'over'); nowEl.classList.toggle('paused', s.paused);
  if(s.phase !== lastPhase){ var key = s.i + ':' + s.phase; if(lastPhase && (s.phase === 'warn' || s.phase === 'over') && !beeped[key]){ beeped[key] = 1; beep(s.phase); } lastPhase = s.phase; }
  banners(p, st, s);
}
var banKey = '';
function banners(p, st, s){
  var h = '', key;
  if(s.delta >= p.lateTh && s.delta > cutHide){
    var sug = T.suggestCuts(p, st, s.delta);
    key = 'cut' + s.delta + JSON.stringify(sug && sug.acts);
    if(sug && sug.acts.length){
      h += '<div class="ban cut">⚠ 預計落後 ' + s.delta + ' 分鐘下課。建議：<ul>' + sug.acts.map(function(a){ return '<li>' + (a.a === 'skip' ? '刪掉' : '縮短') + '「' + esc(p.segs[a.i].t || '第 ' + (a.i + 1) + ' 段') + '」' + (a.a === 'skip' ? '（' + a.m + ' 分）' : ' ' + a.m + ' 分鐘') + '</li>'; }).join('') + '</ul>' +
        (sug.enough ? '' : '<p class="small" style="margin-bottom:.4rem">這樣還差 ' + (sug.late - sug.covered) + ' 分鐘，可能要請學員延後或改成課後補充。</p>') +
        '<div class="stack"><button type="button" class="btn go" data-act="applyCut">套用建議（省 ' + sug.covered + ' 分）</button><button type="button" class="btn" data-act="hideCut">先不要</button></div></div>';
    } else h += '<div class="ban cut">⚠ 預計落後 ' + s.delta + ' 分鐘下課，後面已經沒有可以刪減或壓縮的段落。<div class="stack" style="margin-top:.4rem"><button type="button" class="btn" data-act="hideCut">知道了</button></div></div>';
  } else key = 'nocut';
  if(s.talkNudge && nudgeHide !== s.i){ h += '<div class="ban nudge">🙋 已經連續講了 ' + Math.floor(s.talkStreak / MIN) + ' 分鐘，問個問題或讓學員動一動吧。<button type="button" class="btn sm" data-act="hideNudge" style="margin-left:.5rem">好</button></div>'; key += 'n'; }
  if(s.delta <= -5 && s.next < 0){ h += '<div class="ban info">✅ 預計提早 ' + (-s.delta) + ' 分鐘，可以多留時間問答。</div>'; key += 'e'; }
  if(key !== banKey){ banKey = key; $('lBan').innerHTML = h; }
}
function act(fn){ if(!LIVE) return; fn(LP(), L(), now()); saveLive(); var s = T.status(LP(), L(), now()); if(s.done){ finishLive(); return; } renderLive(); }
var lastNav = 0;
function nav(dir){
  var t = Date.now(); if(t - lastNav < 700) return; lastNav = t; // 簡報筆連按防呆
  if(dir > 0){ var last = T.nextIdx(LP(), L(), L().idx) < 0; act(function(p, st, n){ T.next(p, st, n); }); if(!last) toast('下一段（按 ← 可以回上一段）'); }
  else act(function(p, st, n){ T.prev(p, st, n); });
  railSure = -1;
}
function finishLive(){
  if(!LIVE) return;
  if(!L().done){ L().done = true; L().endedAt = now(); }
  LAST = LIVE; lsSet('last', JSON.stringify(LAST)); LIVE = null; saveLive();
  try{ if(wake) wake.release(); }catch(e){}
  if(document.fullscreenElement) document.exitFullscreen().catch(function(){});
  VIEW = 'report'; lsSet('view', VIEW); render(); toast('課程結束，這是課後時間報告');
}

/* ---------- 課後報告 ---------- */
function renderReport(){
  if(!LAST){ $('body').innerHTML = '<div class="card"><h2>還沒有課後報告</h2><p class="small">上完一堂課（按到最後一段的「結束」或「結束課程」）就會在這裡看到每段預計和實際用了多少時間。</p></div>'; return; }
  var p = LAST.plan, r = T.report(p, LAST.st), dl = r.delta;
  var h = '<div class="card"><h2>📊 ' + esc(p.name || '課程') + '<span class="r">' + new Date(r.started).toLocaleDateString('zh-TW') + ' ' + T.clock(r.started) + '～' + T.clock(r.ended) + '</span></h2>' +
    '<div class="kpi"><div><b>' + T.durText(r.planTot) + '</b>預計</div><div><b>' + T.durText(r.actTot) + '</b>實際上課</div><div><b style="color:' + (dl > 0 ? 'var(--red)' : 'var(--green)') + '">' + (dl > 0 ? '+' + dl : dl) + '</b>和表定下課差（分）</div><div><b>' + r.rows.filter(function(x){ return x.skipped; }).length + '</b>刪減段落</div></div>' +
    (r.tips.length ? '<ul class="chk" style="margin-bottom:.7rem">' + r.tips.map(function(t){ return '<li class="tip">' + esc(t) + '</li>'; }).join('') + '</ul>' : '<ul class="chk" style="margin-bottom:.7rem"><li class="ok">每一段都和預計差不多，時間掌握得很好。</li></ul>') +
    '<div class="tw"><table class="rtab"><thead><tr><th>#</th><th>段落</th><th>類型</th><th>預計</th><th>實際</th><th>差異</th></tr></thead><tbody>' +
    r.rows.map(function(x){ return '<tr><td>' + (x.i + 1) + '</td><td>' + esc(x.t) + (x.skipped ? ' <span class="opt-tag">刪減</span>' : !x.ran ? ' <span class="small">（未上到）</span>' : '') + '</td><td>' + T.TYPES[x.type].n + '</td><td class="n">' + x.plan + '</td><td class="n">' + (x.ran ? x.act : '—') + '</td><td class="n ' + (x.diff > 0 ? 'p' : x.diff < 0 ? 'm' : '') + '">' + (x.diff == null ? '—' : (x.diff > 0 ? '+' : '') + x.diff) + '</td></tr>'; }).join('') +
    '</tbody></table></div><div class="stack" style="margin-top:.7rem"><button type="button" class="btn go" data-act="applyActual">↩ 把實際時間套回排課</button><button type="button" class="btn" data-act="csv">⬇ 下載 CSV</button><button type="button" class="btn" data-act="copyRep">📋 複製報告</button></div>' +
    '<p class="small" style="margin-top:.5rem">「套回排課」會把有上到的段落分鐘數改成實際用時（四捨五入），方便下次排得更準；刪減的段落不會被刪掉。</p></div>';
  $('body').innerHTML = h;
}
function reportText(){
  var p = LAST.plan, r = T.report(p, LAST.st);
  return (p.name || '課程') + ' 課後時間報告\n預計 ' + r.planTot + ' 分，實際 ' + r.actTot + ' 分，和表定下課差 ' + r.delta + ' 分\n\n' +
    r.rows.map(function(x){ return (x.i + 1) + '. ' + x.t + '：預計 ' + x.plan + ' 分，' + (x.skipped ? '刪減' : x.ran ? '實際 ' + x.act + ' 分' : '未上到'); }).join('\n') + (r.tips.length ? '\n\n' + r.tips.join('\n') : '');
}

/* ---------- 列印時間表 ---------- */
function doPrint(){
  var sc = T.schedule(P);
  $('printArea').innerHTML = '<h1>' + esc(P.name || '課程') + '　現場時間表</h1><p>' + esc(P.start) + ' 開始・共 ' + T.durText(sc.total) + (P.end ? '・表定 ' + esc(P.end) + ' 下課' : '') + '・★＝可刪減</p><table><thead><tr><th>時間</th><th>段落</th><th>類型</th><th>分</th><th>要點</th></tr></thead><tbody>' +
    P.segs.map(function(s, i){ var r = sc.rows[i]; return '<tr><td class="t">' + T.hmText(r.s) + '–' + T.hmText(r.e) + '</td><td>' + (s.opt ? '★ ' : '') + esc(s.t) + '</td><td>' + T.TYPES[s.type].n + '</td><td>' + s.min + '</td><td>' + esc(T.lines(s.pts).join('；')) + '</td></tr>'; }).join('') + '</tbody></table>';
  setTimeout(function(){ window.print(); }, 60);
}

/* ---------- 設定 ---------- */
var WARN_HTML = '<h2>⚠ 使用警語</h2><ul>' +
  '<li>計時依這台裝置的時鐘；上課前請確認裝置時間正確、<b>接上電源</b>，並關掉自動鎖定（工具會盡量讓螢幕保持亮著，但部分瀏覽器不支援）。</li>' +
  '<li>刪減與壓縮建議只依你排的分鐘數和「可刪減」標記計算，<b>是否真的刪減請自己判斷</b>；政府補助課程的實際授課時數請依計畫規定，不能因為落後就少上。</li>' +
  '<li>課程與上課紀錄只存在這台裝置的瀏覽器，不會上傳；換裝置前請在「範例與我的課程」匯出。</li>' +
  '<li>提示音需要先點過畫面一次才會響；請先試聽音量，避免干擾學員。</li>' +
  '<li>範例課程全部虛構。</li></ul>';
function showWarn(){ openModal(WARN_HTML + '<div class="stack"><button type="button" class="btn go" data-act="close">我知道了</button></div>'); }
function sec(id, title, val, body){ return '<details class="set-sec" data-sec="' + id + '"><summary><span class="sst">' + title + '</span><span class="ssv">' + esc(val) + '</span></summary><div class="set-body">' + body + '</div></details>'; }
function seg2(attr, cur, opts){ return '<div class="stack">' + opts.map(function(o){ return '<button type="button" class="btn sm' + (cur === o[0] ? ' go' : '') + '" ' + attr + '="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>'; }
function openSettings(){
  var fs = lsGet('fs') === 'xl' ? 'xl' : 'm', lfs = lsGet('lfs') || 'm', light = lsGet('light') === '1', snd = lsGet('sound') !== '0';
  var h = '<div class="top"><h2 style="flex:1 1 0">⚙ 常用設定</h2><button type="button" class="btn sm" data-act="foldall">全部展開／收合</button></div>' +
    sec('view', '顯示', (fs === 'xl' ? '大字' : '標準字') + '・上課' + ({m:'標準', l:'大', xl:'特大'})[lfs] + (light ? '・白底' : ''), '<p class="small">操作畫面字級</p>' + seg2('data-ofs', fs, [['m', '標準字'], ['xl', '大字']]) +
      '<p class="small">上課畫面字級（離講台較遠時用大一點）</p>' + seg2('data-olfs', lfs, [['m', '標準'], ['l', '大'], ['xl', '特大']]) +
      '<p class="small">上課畫面底色（教室很亮、反光時用白底）</p>' + seg2('data-olight', light ? '1' : '0', [['0', '深色'], ['1', '白底']])) +
    sec('sound', '🔔 提示音與震動', snd ? '開' : '關', '<p class="small">段落快結束（變黃）響一聲，超時（變紅）響兩聲；手機會震動。</p>' + seg2('data-osound', snd ? '1' : '0', [['1', '開'], ['0', '關']]) + '<div class="stack"><button type="button" class="btn sm" data-act="testBeep">🔊 試聽</button></div>') +
    sec('keys', '⌨ 簡報筆與鍵盤', '', '<ul class="small" style="padding-left:1.1rem;margin:0"><li><kbd>PageDown</kbd>、<kbd>→</kbd>、<kbd>↓</kbd>：下一段（大部分簡報筆的「下一頁」）</li><li><kbd>PageUp</kbd>、<kbd>←</kbd>、<kbd>↑</kbd>：上一段</li><li><kbd>.</kbd>、<kbd>B</kbd>、<kbd>空白鍵</kbd>：暫停／繼續（簡報筆的「黑畫面」鍵）</li><li><kbd>+</kbd>、<kbd>-</kbd>：這段加減 1 分鐘</li><li>連按 0.7 秒內只算一次，避免簡報筆連點跳太多段。</li></ul>') +
    sec('data', '💾 我的課程', PLANS.length + ' 個', '<div class="stack"><button type="button" class="btn" data-act="exportPlans">⬇ 匯出全部課程</button><label class="btn" style="cursor:pointer">⬆ 匯入<input type="file" accept=".json,application/json" data-file="plans" hidden></label></div>') +
    sec('wipe', '🧹 清除全部資料', '', '<p class="small">清掉編輯中的課程、我的課程、上課中狀態與課後報告。</p><div class="stack"><button type="button" class="btn red" data-act="wipeAll">清除全部資料</button></div>') +
    sec('about', '關於本工具', '', '<p>👤 創作者 Mark Tsai（蔡豐全）<br><a href="mailto:tsaimark@gmail.com">tsaimark@gmail.com</a></p><div class="stack"><a class="btn" href="manual.html">📖 操作手冊</a><a class="btn" href="manual.html#creator">👤 創作者資訊</a><button type="button" class="btn" data-act="warn">⚠ 使用警語</button>' +
      (standalone ? '' : '<button type="button" class="btn" data-act="install">📲 加入主畫面</button>') + '</div><p class="small" style="margin-top:.5rem">訪客數 <img src="https://visitor-badge.laobi.icu/badge?page_id=m255525.lectureteleprompter" alt="訪客次數" height="20" loading="lazy" style="vertical-align:middle"></p>') +
    '<div class="stack"><button type="button" class="btn go" data-act="close">關閉</button></div>';
  openModal(h);
  var open = lsJson('fold', []);
  document.querySelectorAll('.set-sec').forEach(function(d){ d.open = open.indexOf(d.dataset.sec) >= 0; d.addEventListener('toggle', saveFold); });
}
function saveFold(){ var o = []; document.querySelectorAll('.set-sec').forEach(function(d){ if(d.open) o.push(d.dataset.sec); }); lsSet('fold', JSON.stringify(o)); }
function applyView(){ document.documentElement.dataset.fs = lsGet('fs') === 'xl' ? 'xl' : 'm'; document.documentElement.dataset.lfs = lsGet('lfs') || 'm'; document.body.classList.toggle('light-live', lsGet('light') === '1'); }
function install(){
  if(window._dp){ window._dp.prompt(); window._dp = null; return; }
  openModal('<h2>📲 加入主畫面</h2><ul><li><b>iPad／iPhone（Safari）</b>：「分享」→「加入主畫面」。</li><li><b>Android 平板（Chrome）</b>：右上角「⋮」→「安裝應用程式」。</li><li><b>電腦（Chrome／Edge）</b>：網址列右邊的安裝圖示。</li></ul><p class="small">加入後可以離線使用，上課時不怕教室網路不穩。</p><div class="stack"><button type="button" class="btn go" data-act="close">知道了</button></div>');
}
function setPlan(pl, msg){ P = T.normalize(T.clone(pl)); OPENSEG = {}; save(); if(VIEW !== 'edit'){ VIEW = 'edit'; lsSet('view', VIEW); } render(); if(msg) toast(msg); }

var ACT = {
  close:closeModal, warn:showWarn, settings:openSettings, install:install,
  foldall:function(){ var ds = document.querySelectorAll('.set-sec'), any = Array.prototype.some.call(ds, function(d){ return !d.open; }); ds.forEach(function(d){ d.open = any; }); saveFold(); },
  start:startLive,
  addSeg:function(){ if(P.segs.length >= 60){ toast('最多 60 段'); return; } P.segs.push(T.blankSeg()); save(); renderEdit(); var el = document.querySelectorAll('.seg input[data-s="t"]'); if(el.length) el[el.length - 1].focus(); },
  paste:function(){ openModal('<h2>📋 貼上大綱</h2><p class="small">一行一段，後面寫分鐘數，例如「開場與破冰 10」「實作練習｜20分」「午餐 1小時」。全部數字都不超過 8 又沒寫單位時，會當成小時。類型會依標題猜（休息、實作、討論、問答、活動），之後可以再改。</p><textarea id="pasteBox" placeholder="開場與破冰 10\nChatGPT 基本操作 20\n實作：第一個提示詞 20\n休息 10"></textarea><div class="stack"><button type="button" class="btn go" data-act="pasteReplace">取代目前段落</button><button type="button" class="btn" data-act="pasteAppend">接在後面</button><button type="button" class="btn" data-act="close">取消</button></div>'); },
  pasteReplace:function(){ var s = T.parseOutline($('pasteBox').value); if(!s.length){ toast('沒有讀到任何一行'); return; } P.segs = s; save(); closeModal(); renderEdit(); toast('已讀入 ' + s.length + ' 段'); },
  pasteAppend:function(){ var s = T.parseOutline($('pasteBox').value); if(!s.length){ toast('沒有讀到任何一行'); return; } P.segs = P.segs.concat(s).slice(0, 60); save(); closeModal(); renderEdit(); toast('已加入 ' + s.length + ' 段'); },
  mkPick:function(){ openModal(mkPickHtml()); }, mkOk:mkApply,
  fromIpc:function(){ var cs = ipcCourses(); openModal('<h2>🎓 從講師型錄帶入</h2><p class="small">選一門課，用它的大綱（單元｜小時）建立段落，會取代目前的段落。</p><div class="plist">' + cs.map(function(c, i){ return '<div class="pitem"><b>' + esc(c.name) + '</b><button type="button" class="btn sm go" data-ipc="' + i + '">帶入</button></div>'; }).join('') + '</div><div class="stack"><button type="button" class="btn" data-act="close">取消</button></div>'); },
  savePlan:function(){ var n = (P.name || '').trim() || '未命名課程'; PLANS = PLANS.filter(function(x){ return x.name !== n; }); PLANS.unshift({name:n, plan:T.clone(P)}); PLANS = PLANS.slice(0, 30); lsSet('plans', JSON.stringify(PLANS)); renderEdit(); toast('已存到我的課程「' + n + '」'); },
  newPlan:function(){ var b = T.blank(); b.segs.push(T.blankSeg()); setPlan(b, '已開新的空白課程（原本的如果要留，記得先存）'); },
  exportPlans:function(){ var all = PLANS.slice(); if(P.segs.length && !all.some(function(x){ return x.name === (P.name || '未命名課程'); })) all.unshift({name:P.name || '未命名課程', plan:P}); download(new Blob([JSON.stringify({app:'lecture-teleprompter', v:1, plans:all}, null, 1)], {type:'application/json'}), '我的課程_提詞器.json'); toast('已匯出 ' + all.length + ' 個課程'); },
  print:doPrint,
  endAsk:function(){ openModal('<h2>⏹ 結束這堂課？</h2><p>會停止計時並產生課後時間報告，還沒上到的段落會標成「未上到」。</p><div class="stack"><button type="button" class="btn red" data-act="endOk">結束課程</button><button type="button" class="btn" data-act="close">繼續上課</button></div>'); },
  endOk:function(){ closeModal(); if(LIVE){ T.go(LP(), L(), -1, now()); saveLive(); finishLive(); } },
  next:function(){ nav(1); }, prev:function(){ nav(-1); },
  pause:function(){ act(function(p, st, n){ T.togglePause(st, n); }); },
  plus:function(){ act(function(p, st){ T.adjust(p, st, 1); }); }, minus:function(){ act(function(p, st){ T.adjust(p, st, -1); }); },
  skipCur:function(){ act(function(p, st, n){ var i = st.idx, j = T.nextIdx(p, st, i); st.skip[i] = true; st.idx = i; T.go(p, st, j, n); }); toast('已刪掉這段'); },
  applyCut:function(){ var s = T.status(LP(), L(), now()); var sug = T.suggestCuts(LP(), L(), s.delta); if(sug){ T.applyCuts(L(), sug); saveLive(); banKey = ''; renderLive(); toast('已套用，省下 ' + sug.covered + ' 分鐘'); } },
  hideCut:function(){ cutHide = T.status(LP(), L(), now()).delta + 2; banKey = ''; $('lBan').innerHTML = ''; tick(); },
  hideNudge:function(){ nudgeHide = L().idx; banKey = ''; tick(); },
  noteToggle:function(){ lsSet('note', lsGet('note') === '0' ? '1' : '0'); renderLive(); },
  fullscreen:function(){ var d = document.documentElement; if(document.fullscreenElement) document.exitFullscreen().catch(function(){}); else if(d.requestFullscreen) d.requestFullscreen().catch(function(){ toast('這個瀏覽器不支援全螢幕，請改用「加入主畫面」'); }); else toast('這個瀏覽器不支援全螢幕，請改用「加入主畫面」'); },
  applyActual:function(){ if(!LAST) return; var r = T.report(LAST.plan, LAST.st), np = T.clone(LAST.plan); r.rows.forEach(function(x){ if(x.ran && x.act >= 1) np.segs[x.i].min = Math.round(x.act); }); setPlan(np, '已把實際時間套回排課，記得檢查總長'); },
  csv:function(){ if(!LAST) return; download(new Blob(['﻿' + T.reportCsv(LAST.plan, T.report(LAST.plan, LAST.st))], {type:'text/csv;charset=utf-8'}), safeName(LAST.plan.name) + '_課後時間報告.csv'); toast('已下載 CSV'); },
  copyRep:function(){ if(LAST) copyText(reportText(), '已複製報告'); },
  testBeep:function(){ var s = lsGet('sound'); lsSet('sound', '1'); beep('warn'); setTimeout(function(){ beep('over'); if(s === '0') lsSet('sound', '0'); }, 600); },
  wipeAll:function(){ openModal('<h2>🧹 清除全部資料？</h2><p>編輯中的課程、我的課程、上課中狀態與課後報告都會刪掉，不能復原。</p><div class="stack"><button type="button" class="btn red" data-act="wipeOk">確定清除</button><button type="button" class="btn" data-act="close">取消</button></div>'); },
  wipeOk:function(){ ['plan', 'plans', 'live', 'last', 'view', 'fold'].forEach(lsDel); P = T.blank(); P.segs.push(T.blankSeg()); PLANS = []; LIVE = null; LAST = null; VIEW = 'edit'; closeModal(); save(); render(); toast('已清除'); }
};

function segIdx(el){ var s = el.closest('.seg'); return s ? +s.dataset.i : -1; }
document.addEventListener('click', function(e){
  var t = e.target.closest('[data-act],[data-view],[data-ex],[data-load],[data-delplan],[data-mv],[data-ins],[data-del],[data-jump],[data-ipc],[data-mkin],[data-ofs],[data-olfs],[data-olight],[data-osound]');
  if(!t || t.disabled) return;
  if(t.tagName === 'A' && t.getAttribute('href') === '#') e.preventDefault();
  var d = t.dataset;
  if(d.act && ACT[d.act]){ e.preventDefault(); ACT[d.act](); return; }
  if(d.view){ if(d.view === 'live'){ if(LIVE){ VIEW = 'live'; lsSet('view', VIEW); render(); requestWake(); } else startLive(); return; } VIEW = d.view; lsSet('view', VIEW); render(); return; }
  if(d.ex){ var ex = T.EXAMPLES.filter(function(x){ return x.id === d.ex; })[0]; if(ex) setPlan(ex.p, '已載入範例「' + ex.n + '」（虛構）'); return; }
  if(d.load){ var pl = PLANS[+d.load]; if(pl) setPlan(pl.plan, '已開啟「' + pl.name + '」'); return; }
  if(d.delplan){ if(!t.dataset.sure){ t.dataset.sure = '1'; t.textContent = '?'; t.style.borderColor = 'var(--red)'; setTimeout(function(){ if(t.isConnected){ delete t.dataset.sure; t.textContent = '✕'; t.style.borderColor = ''; } }, 3000); toast('再按一次刪除'); return; } PLANS.splice(+d.delplan, 1); lsSet('plans', JSON.stringify(PLANS)); renderEdit(); return; }
  if(d.mv){ var i = segIdx(t), j = i + (+d.mv); if(j < 0 || j >= P.segs.length) return; var x = P.segs[i]; P.segs[i] = P.segs[j]; P.segs[j] = x; var o = OPENSEG[i]; OPENSEG[i] = OPENSEG[j]; OPENSEG[j] = o; save(); renderEdit(); return; }
  if(d.ins != null && t.hasAttribute('data-ins')){ var k = segIdx(t); if(P.segs.length >= 60) return; P.segs.splice(k + 1, 0, T.blankSeg()); OPENSEG = {}; save(); renderEdit(); var ins = document.querySelectorAll('.seg input[data-s="t"]')[k + 1]; if(ins) ins.focus(); return; }
  if(t.hasAttribute('data-del')){ var m = segIdx(t); if((P.segs[m].t || P.segs[m].pts) && !t.dataset.sure){ t.dataset.sure = '1'; t.textContent = '?'; t.style.borderColor = 'var(--red)'; setTimeout(function(){ if(t.isConnected){ delete t.dataset.sure; t.textContent = '✕'; t.style.borderColor = ''; } }, 3000); toast('再按一次刪除這段'); return; } P.segs.splice(m, 1); OPENSEG = {}; save(); renderEdit(); return; }
  if(d.jump){ var q = +d.jump; if(!LIVE || q === L().idx) return; if(railSure !== q){ railSure = q; $('lRail').innerHTML = '<p class="small" style="padding:0 .3rem .2rem">表定時間・點兩下可跳到該段</p>' + railHtml(LP(), L()); return; } railSure = -1; if(L().skip[q]) delete L().skip[q]; act(function(p, st, n){ T.go(p, st, q, n); }); return; }
  if(d.mkin){ mkAsk(d.mkin); return; }
  if(d.ipc){ var c = ipcCourses()[+d.ipc]; if(c){ var np = T.clone(P); np.name = c.name; np.segs = T.parseOutline(c.outline, true); closeModal(); setPlan(np, '已帶入「' + c.name + '」的大綱，請補上休息與互動'); } return; }
  if(d.ofs){ lsSet('fs', d.ofs); applyView(); openSettings(); return; }
  if(d.olfs){ lsSet('lfs', d.olfs); applyView(); openSettings(); return; }
  if(d.olight){ lsSet('light', d.olight); applyView(); openSettings(); return; }
  if(d.osound){ lsSet('sound', d.osound); openSettings(); return; }
});
var sideT;
document.addEventListener('input', function(e){
  var t = e.target;
  if(t.dataset.p){ var k = t.dataset.p, v = t.value; P[k] = /warn|talkMax|lateTh/.test(k) ? Math.max(0, Math.min(120, +v || 0)) : v; save(); clearTimeout(sideT); sideT = setTimeout(refreshSide, 150); return; }
  if(t.dataset.s){ var i = segIdx(t); if(i < 0) return; var s = P.segs[i], k2 = t.dataset.s;
    if(k2 === 'min'){ var n = +t.value; if(!(n > 0)) return; s.min = Math.min(600, Math.round(n)); }
    else if(k2 === 'opt') s.opt = t.checked; else s[k2] = t.value;
    save(); clearTimeout(sideT); sideT = setTimeout(refreshSide, 150); return; }
});
document.addEventListener('change', function(e){
  if(e.target.id === 'mkFile' && e.target.files[0]){ var mt = e.target, mf = new FileReader(); mf.onload = function(){ mt.value = ''; var r = MKCourse.fromText(mf.result); if(r.error){ toast(r.error); return; } var last = null; r.docs.forEach(function(x){ last = MK.store.put(x) || last; }); if(!last){ toast('存不進這台電腦（瀏覽器空間不足或封鎖網站資料）'); return; } if(r.docs.length === 1) mkAsk(last.id); else openModal(mkPickHtml()); }; mf.readAsText(mt.files[0]); return; }
  var t = e.target;
  if(t.dataset.file === 'plans' && t.files && t.files[0]){
    var fr = new FileReader();
    fr.onload = function(){ try{ var j = JSON.parse(fr.result), arr = Array.isArray(j) ? j : j.plans; if(!Array.isArray(arr)) throw new Error('不是這個工具的匯出檔'); var add = 0; arr.forEach(function(x){ if(x && x.plan){ var n = String(x.name || x.plan.name || '未命名課程').slice(0, 60); PLANS = PLANS.filter(function(y){ return y.name !== n; }); PLANS.unshift({name:n, plan:T.normalize(x.plan)}); add++; } }); PLANS = PLANS.slice(0, 30); lsSet('plans', JSON.stringify(PLANS)); closeModal(); if(VIEW === 'edit') renderEdit(); toast('已匯入 ' + add + ' 個課程'); }catch(err){ toast('讀不懂：' + err.message); } };
    fr.readAsText(t.files[0]); t.value = '';
  }
});
document.addEventListener('toggle', function(e){ var d = e.target; if(d.dataset && d.dataset.od != null){ OPENSEG[+d.dataset.od] = d.open; } }, true);
$('modal').addEventListener('click', function(e){ if(e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', function(e){
  if(e.key === 'Escape' && $('modal').classList.contains('show')){ closeModal(); return; }
  if(VIEW !== 'live' || !LIVE || $('modal').classList.contains('show')) return;
  if(/INPUT|TEXTAREA|SELECT/.test((e.target.tagName || ''))) return;
  var k = e.key;
  if(k === 'PageDown' || k === 'ArrowRight' || k === 'ArrowDown'){ e.preventDefault(); nav(1); }
  else if(k === 'PageUp' || k === 'ArrowLeft' || k === 'ArrowUp'){ e.preventDefault(); nav(-1); }
  else if(k === '.' || k === 'b' || k === 'B' || k === ' '){ e.preventDefault(); ACT.pause(); }
  else if(k === '+' || k === '='){ ACT.plus(); } else if(k === '-' || k === '_'){ ACT.minus(); }
});

/* ---------- 跑馬燈（工作區共用公告，不可關） ---------- */
function initMarquee(){
  var URL_ = "https://script.google.com/macros/s/AKfycbwKX0DNNbY8y4nf90BFTHtxgfqJcHHcZasRrgycl4QAe52_hkjMWSkYk4xOsqU-JPCROw/exec";
  var REFRESH = 20 * 60 * 1000, bar = $('marqueeBar'), track = $('marqueeTrack'), lastKey = null;
  function appendText(c, text){ var re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, li = 0, m; while((m = re.exec(text))){ if(m.index > li) c.appendChild(document.createTextNode(text.slice(li, m.index))); var a = document.createElement('a'); a.href = m[2]; a.textContent = m[1]; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.color = 'inherit'; a.style.textDecoration = 'underline'; c.appendChild(a); li = re.lastIndex; } if(li < text.length) c.appendChild(document.createTextNode(text.slice(li))); }
  function renderM(items){
    if(!items || !items.length) return;
    var k = JSON.stringify(items); if(k === lastKey) return; lastKey = k; track.innerHTML = '';
    var fr = document.createDocumentFragment();
    function pass(){ items.forEach(function(it, i){ if(i > 0) fr.appendChild(document.createTextNode('　★　')); appendText(fr, String(it)); }); }
    pass(); fr.appendChild(document.createTextNode('　★　')); pass(); track.appendChild(fr);
    bar.classList.add('show'); document.body.classList.add('has-marquee');
    track.style.animationDuration = Math.max(track.scrollWidth / 2 / 60, 12) + 's';
  }
  function fetchM(){ fetch(URL_, {method:'POST', body:JSON.stringify({serial:''})}).then(function(r){ return r.json(); }).then(function(d){ if(d && Array.isArray(d.marquee) && d.marquee.length){ lsSet('marquee', JSON.stringify(d.marquee)); renderM(d.marquee); } }).catch(function(){}); }
  renderM(lsJson('marquee', [])); fetchM(); setInterval(fetchM, REFRESH);
}

window.addEventListener('beforeinstallprompt', function(e){ e.preventDefault(); window._dp = e; });
if('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('service-worker.js').catch(function(){});

applyView();
if(firstRun){ P = T.normalize(T.clone(T.EXAMPLES[0].p)); save(); }
if(!P.segs.length) P.segs.push(T.blankSeg());
if(['edit', 'live', 'report'].indexOf(VIEW) < 0) VIEW = 'edit';
render(); initMarquee();
tickT = setInterval(tick, 250);
if(LIVE && VIEW === 'live'){ requestWake(); setTimeout(function(){ toast('已接著上次的上課計時'); }, 400); }
if(!lsGet('warnSeen')){ showWarn(); lsSet('warnSeen', '1'); }
window._tp = {get P(){ return P; }, get LIVE(){ return LIVE; }, get LAST(){ return LAST; }, get VIEW(){ return VIEW; }, ACT:ACT, skip:function(ms){ OFFSET += ms; lastNav = 0; tick(); }, tick:tick, resetNav:function(){ lastNav = 0; }};
})();
