/* 講師現場提詞器：純函式引擎（瀏覽器掛 window.TP，node 可 require）。
 * 時間一律用毫秒時間戳，now 由呼叫端傳入（方便測試）。改了這個檔要跑 node tools/test_engine.mjs */
(function(root){
'use strict';

var MIN = 60000;
function clone(o){ return JSON.parse(JSON.stringify(o)); }
function str(v){ return v == null ? '' : String(v); }
function cut(s, n){ return Array.from(str(s)).slice(0, n).join(''); }
function lines(s, max){ return str(s).split(/\r?\n/).map(function(x){ return x.replace(/^\s*[-*•・●]\s*/, '').trim(); }).filter(Boolean).slice(0, max || 99); }
function pad(n){ return (n < 10 ? '0' : '') + n; }

var TYPES = {
  talk:{n:'講授', ic:'🎙', c:'#6EA8FE', shrink:0},
  practice:{n:'實作練習', ic:'🛠', c:'#3DD68C', shrink:.3},
  discuss:{n:'分組討論', ic:'💬', c:'#C49BFF', shrink:.3},
  interact:{n:'互動活動', ic:'🙋', c:'#FF9F5A', shrink:.3},
  qa:{n:'問答', ic:'❓', c:'#5DD3E0', shrink:.4},
  'break':{n:'休息', ic:'☕', c:'#9AA3B2', shrink:.3}
};
var TYPE_KEYS = Object.keys(TYPES);

/* ---------- 時間文字 ---------- */
function hm(t){ var m = /^(\d{1,2})[:：](\d{2})$/.exec(str(t).trim()); if(!m) return null; var h = +m[1], mi = +m[2]; return h < 24 && mi < 60 ? h * 60 + mi : null; }
function hmText(min){ min = ((Math.round(min) % 1440) + 1440) % 1440; return pad(Math.floor(min / 60)) + ':' + pad(min % 60); }
function clock(ts){ var d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function mmss(ms){ var neg = ms < 0; ms = Math.abs(ms); var s = Math.floor(ms / 1000), m = Math.floor(s / 60); return (neg ? '+' : '') + (m >= 60 ? Math.floor(m / 60) + ':' + pad(m % 60) : m) + ':' + pad(s % 60); }
function durText(min){ min = Math.round(min); if(min < 60) return min + ' 分'; return Math.floor(min / 60) + ' 小時' + (min % 60 ? ' ' + (min % 60) + ' 分' : ''); }

/* ---------- 課程計畫 ---------- */
function blankSeg(){ return {t:'', min:15, type:'talk', opt:false, pts:'', note:''}; }
function blank(){ return {name:'', start:'09:00', end:'', warn:2, talkMax:20, lateTh:3, segs:[]}; }
function normalize(p){
  var b = blank();
  if(!p || typeof p !== 'object') return b;
  b.name = cut(p.name, 60); b.start = hm(p.start) != null ? str(p.start).replace('：', ':') : '09:00';
  b.end = hm(p.end) != null ? str(p.end).replace('：', ':') : '';
  ['warn', 'talkMax', 'lateTh'].forEach(function(k){ var v = +p[k]; if(isFinite(v) && v >= 0 && v <= 120) b[k] = v; });
  if(Array.isArray(p.segs)) b.segs = p.segs.slice(0, 60).map(function(s){
    var n = blankSeg(); s = s || {};
    n.t = cut(s.t, 60); var m = +s.min; n.min = isFinite(m) && m > 0 ? Math.min(600, Math.round(m * 2) / 2) : 1;
    n.type = TYPES[s.type] ? s.type : 'talk'; n.opt = !!s.opt; n.pts = cut(s.pts, 600); n.note = cut(s.note, 3000);
    return n;
  });
  return b;
}
function total(plan){ return plan.segs.reduce(function(a, s){ return a + s.min; }, 0); }
function schedule(plan){
  var t = hm(plan.start); if(t == null) t = 540;
  var out = plan.segs.map(function(s, i){ var r = {i:i, s:t, e:t + s.min}; t += s.min; return r; });
  var tot = total(plan), e = hm(plan.end), avail = e != null ? (e - hm(plan.start || '09:00') + 1440) % 1440 : null;
  return {rows:out, total:tot, endAt:hm(plan.start || '09:00') + tot, avail:avail, diff:avail == null ? 0 : tot - avail};
}
/* 排課檢查：總長、連續講授、太久沒休息、空標題 */
function checks(plan){
  var w = [], sc = schedule(plan);
  if(!plan.segs.length) return [{lv:'bad', t:'還沒有任何段落'}];
  if(sc.avail != null && sc.diff > 0) w.push({lv:'bad', t:'總長 ' + durText(sc.total) + '，比表定多 ' + sc.diff + ' 分鐘，會超時下課'});
  if(sc.avail != null && sc.diff < 0) w.push({lv:'warn', t:'總長比表定少 ' + (-sc.diff) + ' 分鐘，可以多留問答或練習時間'});
  var streak = 0, from = 0, sinceBreak = 0;
  plan.segs.forEach(function(s, i){
    if(!str(s.t).trim()) w.push({lv:'warn', t:'第 ' + (i + 1) + ' 段還沒有標題'});
    if(s.type === 'talk'){ if(!streak) from = i; streak += s.min; } else streak = 0;
    if(s.type === 'talk' && streak > plan.talkMax && (i === plan.segs.length - 1 || plan.segs[i + 1].type !== 'talk'))
      w.push({lv:'warn', t:'第 ' + (from + 1) + (from === i ? '' : '～' + (i + 1)) + ' 段' + (from === i ? '講授' : '連續講授') + ' ' + streak + ' 分鐘（超過 ' + plan.talkMax + ' 分），建議' + (from === i ? '拆成兩段，' : '') + '中間插一段互動或練習', i:i});
    if(s.type === 'break') sinceBreak = 0; else { sinceBreak += s.min; if(sinceBreak > 120 && sinceBreak - s.min <= 120) w.push({lv:'warn', t:'到第 ' + (i + 1) + ' 段已經連續 ' + sinceBreak + ' 分鐘沒休息', i:i}); }
  });
  if(!plan.segs.some(function(s){ return s.opt; }) && plan.segs.length >= 4) w.push({lv:'tip', t:'建議把 1～2 段標成「可刪減」，現場落後時才有東西可以砍'});
  return w;
}

/* 大綱文字 → 段落：「標題｜15」「標題 15分」「標題｜1.5小時」 */
function guessType(t){
  if(/休息|午餐|午休|茶敘|break|lunch/i.test(t)) return 'break';
  if(/問答|q\s*&\s*a|qa|提問/i.test(t)) return 'qa';
  if(/實作|練習|演練|操作|作業|hands/i.test(t)) return 'practice';
  if(/討論|分組|小組|共創|工作坊/i.test(t)) return 'discuss';
  if(/破冰|活動|遊戲|互動|投票|搶答|暖身/i.test(t)) return 'interact';
  return 'talk';
}
function parseOutline(text, hoursUnit){
  var RE = /^(.*?)[\s｜|／\/,，、:：]*(\d+(?:\.\d+)?)\s*(分鐘|分|min|m|小時|hr|h)?\s*$/i;
  if(hoursUnit == null){ // 沒寫單位時：全部數字都不超過 8，就當成小時（課程大綱常寫「單元｜1.5」）
    var bare = lines(text, 60).map(function(x){ var m = x.match(RE); return m && m[1].trim() && !m[3] ? +m[2] : null; }).filter(function(n){ return n != null; });
    hoursUnit = bare.length > 0 && bare.every(function(n){ return n <= 8; });
  }
  return lines(text, 60).map(function(x){
    var m = x.match(RE), t = x, min = 15;
    if(m && m[1].trim()){
      t = m[1].trim(); var n = +m[2], u = (m[3] || '').toLowerCase();
      min = /小時|hr|h/.test(u) || (!u && hoursUnit) ? n * 60 : n;
    }
    var s = blankSeg(); s.t = cut(t.replace(/[｜|]+$/, '').trim(), 60); s.min = Math.max(1, Math.round(min)); s.type = guessType(s.t);
    return s;
  });
}

/* ---------- 上課中狀態 ----------
   live = {startedAt, plannedEnd, rel, idx, segStart, paused(ts|0), pausedMs, adj{i:分}, skip{i:true}, log[{i,s,e}], done} */
function startLive(plan, now){
  var tot = total(plan), ps = hm(plan.start), pe = hm(plan.end);
  var d = new Date(now); d.setSeconds(0, 0);
  var startTs = ps == null ? now : new Date(d.getFullYear(), d.getMonth(), d.getDate(), Math.floor(ps / 60), ps % 60).getTime();
  var endMin = pe != null ? (pe - ps + 1440) % 1440 : tot;
  var rel = ps == null || Math.abs(now - startTs) > 30 * MIN; // 和表定開始差超過 30 分鐘（排練或改時間）就改用實際開始時間算
  return {startedAt:now, plannedEnd:(rel ? now : startTs) + endMin * MIN, rel:rel, idx:firstIdx(plan, {}), segStart:now, paused:0, pausedMs:0, adj:{}, skip:{}, log:[], done:false};
}
function firstIdx(plan, skip){ for(var i = 0; i < plan.segs.length; i++) if(!skip[i]) return i; return -1; }
function segMin(plan, live, i){ return Math.max(0, plan.segs[i].min + ((live.adj || {})[i] || 0)); }
function elapsed(live, now){ return Math.max(0, (live.paused || now) - live.segStart - live.pausedMs); }
function futureMin(plan, live, from){ var a = 0; for(var i = from; i < plan.segs.length; i++) if(!live.skip[i]) a += segMin(plan, live, i); return a; }
function nextIdx(plan, live, i){ for(var j = i + 1; j < plan.segs.length; j++) if(!live.skip[j]) return j; return -1; }
function prevIdx(plan, live, i){ for(var j = i - 1; j >= 0; j--) if(!live.skip[j]) return j; return -1; }
function actualMs(live, i){ return live.log.reduce(function(a, l){ return a + (l.i === i ? Math.max(0, l.e - l.s - (l.p || 0)) : 0); }, 0); } // 裝置時鐘被往回調時不會變負數
function status(plan, live, now){
  if(live.done || live.idx < 0) return {done:true, delta:Math.round((((live.endedAt || now) - live.plannedEnd)) / MIN)};
  var i = live.idx, seg = plan.segs[i], dur = segMin(plan, live, i) * MIN, el = elapsed(live, now), remain = dur - el;
  var proj = now + Math.max(0, remain) + futureMin(plan, live, i + 1) * MIN;
  var delta = Math.round((proj - live.plannedEnd) / MIN);
  var streak = 0;
  if(seg.type === 'talk'){
    streak = el;
    for(var k = live.log.length - 1; k >= 0; k--){ var l = live.log[k]; if(plan.segs[l.i].type !== 'talk') break; streak += l.e - l.s - (l.p || 0); }
  }
  var phase = remain < 0 ? 'over' : remain <= plan.warn * MIN ? 'warn' : 'ok';
  return {i:i, seg:seg, dur:dur, el:el, remain:remain, phase:phase, pct:dur ? Math.min(1, el / dur) : 1, proj:proj, delta:delta,
    next:nextIdx(plan, live, i), talkStreak:streak, talkNudge:seg.type === 'talk' && plan.talkMax > 0 && streak >= plan.talkMax * MIN, paused:!!live.paused};
}
function closeSeg(live, now){
  var p = live.pausedMs + (live.paused ? now - live.paused : 0);
  if(now - live.segStart - p > 1000 || live.log.length === 0 || live.log[live.log.length - 1].i !== live.idx) live.log.push({i:live.idx, s:live.segStart, e:now, p:p});
}
function go(plan, live, to, now){
  if(live.done) return live;
  closeSeg(live, now);
  live.idx = to; live.segStart = now; live.paused = 0; live.pausedMs = 0;
  if(to < 0){ live.done = true; live.endedAt = now; }
  return live;
}
function next(plan, live, now){ return go(plan, live, nextIdx(plan, live, live.idx), now); }
function prev(plan, live, now){ var j = prevIdx(plan, live, live.idx); return j < 0 ? live : go(plan, live, j, now); }
function togglePause(live, now){ if(live.paused){ live.pausedMs += now - live.paused; live.paused = 0; } else live.paused = now; return live; }
function adjust(plan, live, d){ var i = live.idx; if(i < 0) return live; var v = (live.adj[i] || 0) + d; if(plan.segs[i].min + v < 1) v = 1 - plan.segs[i].min; live.adj[i] = v; return live; }

/* ---------- 落後時的刪減建議 ----------
   先從後面「可刪減」的段落找總分鐘數剛好夠補回落後、而且最少的組合；不夠再壓縮練習、討論、互動、問答、休息（各自上限比例，至少留 5 分鐘）。講授不壓縮。 */
function suggestCuts(plan, live, late){
  if(!(late > 0) || live.done) return null;
  var cand = [], i0 = live.idx + 1;
  for(var i = i0; i < plan.segs.length; i++) if(!live.skip[i] && plan.segs[i].opt) cand.push({i:i, m:segMin(plan, live, i)});
  var best = null;
  if(cand.length && cand.length <= 14){
    for(var mask = 1; mask < (1 << cand.length); mask++){
      var sum = 0, pick = [];
      for(var b = 0; b < cand.length; b++) if(mask & (1 << b)){ sum += cand[b].m; pick.push(cand[b]); }
      if(sum >= late && (!best || sum < best.sum || (sum === best.sum && pick.length < best.pick.length))) best = {sum:sum, pick:pick};
    }
  }
  var acts = [], covered = 0;
  if(best){ best.pick.forEach(function(c){ acts.push({a:'skip', i:c.i, m:c.m}); }); covered = best.sum; }
  else {
    cand.sort(function(a, b){ return b.m - a.m; });
    cand.forEach(function(c){ if(covered < late){ acts.push({a:'skip', i:c.i, m:c.m}); covered += c.m; } });
    var sh = [];
    for(var j = plan.segs.length - 1; j >= i0; j--){
      if(live.skip[j] || acts.some(function(x){ return x.i === j; })) continue;
      var s = plan.segs[j], cur = segMin(plan, live, j), cap = Math.min(Math.floor(cur * TYPES[s.type].shrink), Math.max(0, cur - 5));
      if(cap > 0) sh.push({i:j, cap:cap});
    }
    sh.forEach(function(x){ if(covered < late){ var m = Math.min(x.cap, late - covered); acts.push({a:'shrink', i:x.i, m:m}); covered += m; } });
  }
  return acts.length ? {late:late, acts:acts, covered:covered, enough:covered >= late} : {late:late, acts:[], covered:0, enough:false};
}
function applyCuts(live, sug){
  (sug && sug.acts || []).forEach(function(a){ if(a.a === 'skip') live.skip[a.i] = true; else live.adj[a.i] = (live.adj[a.i] || 0) - a.m; });
  return live;
}

/* ---------- 課後報告 ---------- */
function report(plan, live){
  var rows = plan.segs.map(function(s, i){
    var act = actualMs(live, i) / MIN, ran = live.log.some(function(l){ return l.i === i; });
    return {i:i, t:s.t, type:s.type, plan:s.min, act:Math.round(act * 10) / 10, diff:ran ? Math.round((act - s.min) * 10) / 10 : null, skipped:!!live.skip[i] && !ran, ran:ran};
  });
  var planTot = total(plan), actTot = rows.reduce(function(a, r){ return a + r.act; }, 0);
  var tips = [];
  rows.filter(function(r){ return r.ran && r.diff >= 3; }).sort(function(a, b){ return b.diff - a.diff; }).slice(0, 3).forEach(function(r){
    tips.push('「' + (r.t || '第 ' + (r.i + 1) + ' 段') + '」實際用了 ' + Math.round(r.act) + ' 分鐘（排 ' + r.plan + ' 分），下次可以排 ' + Math.round(r.act) + ' 分鐘，或把內容拆小。');
  });
  rows.filter(function(r){ return r.ran && r.diff <= -5; }).slice(0, 2).forEach(function(r){ tips.push('「' + (r.t || '第 ' + (r.i + 1) + ' 段') + '」比預計快 ' + Math.round(-r.diff) + ' 分鐘，可以縮短或多放一個練習。'); });
  var sk = rows.filter(function(r){ return r.skipped; });
  if(sk.length) tips.push('這次刪掉了 ' + sk.map(function(r){ return '「' + r.t + '」'; }).join('、') + '，下次可以考慮移到講義或課後補充。');
  var end = live.endedAt || (live.log.length ? live.log[live.log.length - 1].e : live.startedAt);
  var delta = Math.round((end - live.plannedEnd) / MIN);
  return {rows:rows, planTot:planTot, actTot:Math.round(actTot), started:live.startedAt, ended:end, delta:delta, tips:tips};
}
function reportCsv(plan, rep){
  var q = function(v){ v = str(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  var out = [['#', '段落', '類型', '預計(分)', '實際(分)', '差異(分)', '狀態'].join(',')];
  rep.rows.forEach(function(r){ out.push([r.i + 1, q(r.t), TYPES[r.type].n, r.plan, r.ran ? r.act : '', r.diff == null ? '' : r.diff, r.skipped ? '刪減' : r.ran ? '完成' : '未上到'].join(',')); });
  out.push(['', '合計', '', rep.planTot, rep.actTot, rep.actTot - rep.planTot, ''].join(','));
  return out.join('\r\n');
}

/* ---------- 範例（全部虛構） ---------- */
function S(t, min, type, opt, pts, note){ return {t:t, min:min, type:type, opt:!!opt, pts:pts || '', note:note || ''}; }
var EXAMPLES = [
  {id:'ai', n:'AI 工具入門（3 小時）', d:'09:00～12:00・含 2 段可刪減', p:{name:'AI 工具入門：讓 ChatGPT 幫你做事', start:'09:00', end:'12:00', warn:2, talkMax:20, lateTh:3, segs:[
    S('開場與破冰：你最想讓 AI 幫你做什麼？', 10, 'interact', false, '先講今天的三個目標\n請學員在便利貼寫一個想用 AI 做的事', '開場不要超過 10 分鐘，便利貼收回來後面實作會用到'),
    S('ChatGPT 基本操作', 20, 'talk', false, '註冊與介面\n新對話、分享、刪除\n免費版和付費版差在哪'),
    S('實作：寫出第一個提示詞', 20, 'practice', false, '用便利貼上的題目實際問一次\n比較兩種問法的差別'),
    S('休息', 10, 'break'),
    S('提示詞六要素', 20, 'talk', false, '角色、任務、背景、格式、語氣、限制\n每個要素各一個例子'),
    S('分組討論：工作上的三個應用', 15, 'discuss', false, '每組選一個情境\n寫出提示詞並上台分享'),
    S('案例補充：客服回覆信', 10, 'talk', true, '同一封客訴，加不加背景的差別'),
    S('實作：做一份簡報大綱', 35, 'practice', false, '主題自選\n要用到至少四個要素\n巡堂看卡住的人'),
    S('延伸：圖片生成示範', 10, 'talk', true, '只示範不實作'),
    S('問答', 20, 'qa'),
    S('總結與課後作業', 10, 'talk', false, '三個重點回顧\n作業：用 AI 寫一封工作信')
  ]}},
  {id:'talk', n:'90 分鐘講座', d:'14:00～15:30・投票與搶答', p:{name:'小店社群經營講座', start:'14:00', end:'15:30', warn:2, talkMax:20, lateTh:3, segs:[
    S('開場：今天會帶走什麼', 5, 'talk'),
    S('現場投票：你用哪個平台？', 5, 'interact', false, '用講師課堂小幫手開投票'),
    S('社群定位三問', 20, 'talk', false, '賣什麼\n賣給誰\n為什麼是你'),
    S('兩人一組：寫一則貼文', 15, 'practice'),
    S('案例：三家小店的貼文拆解', 15, 'talk', true),
    S('搶答：哪則貼文互動最高？', 5, 'interact'),
    S('內容行事曆怎麼排', 10, 'talk'),
    S('問答', 10, 'qa'),
    S('結語與資源', 5, 'talk')
  ]}},
  {id:'day', n:'全天工作坊（6 小時）', d:'09:00～16:00・含午餐', p:{name:'餐飲開店成本工作坊', start:'09:00', end:'16:00', warn:3, talkMax:25, lateTh:5, segs:[
    S('報到與開場', 15, 'interact'),
    S('開店資金與固定成本', 25, 'talk'),
    S('演練：算出自己的固定成本', 30, 'practice'),
    S('休息', 10, 'break'),
    S('食材成本與菜單定價', 25, 'talk'),
    S('小組：定價怎麼訂', 20, 'discuss'),
    S('菜單工程四象限', 20, 'talk'),
    S('演練：算每道菜的毛利', 25, 'practice'),
    S('上午問答', 10, 'qa'),
    S('午餐', 60, 'break'),
    S('損益兩平試算', 25, 'talk'),
    S('演練：每天要賣多少', 35, 'practice'),
    S('休息', 10, 'break'),
    S('常見虧損案例', 20, 'talk', true),
    S('分組：互相健檢', 40, 'discuss'),
    S('現金流提醒', 15, 'talk', true),
    S('問答與總結', 35, 'qa')
  ]}}
];

var api = {MIN:MIN, TYPES:TYPES, TYPE_KEYS:TYPE_KEYS, clone:clone, lines:lines, hm:hm, hmText:hmText, clock:clock, mmss:mmss, durText:durText,
  blank:blank, blankSeg:blankSeg, normalize:normalize, total:total, schedule:schedule, checks:checks, guessType:guessType, parseOutline:parseOutline,
  startLive:startLive, segMin:segMin, elapsed:elapsed, status:status, next:next, prev:prev, go:go, togglePause:togglePause, adjust:adjust,
  nextIdx:nextIdx, prevIdx:prevIdx, suggestCuts:suggestCuts, applyCuts:applyCuts, report:report, reportCsv:reportCsv, actualMs:actualMs, EXAMPLES:EXAMPLES};
if(typeof module !== 'undefined' && module.exports) module.exports = api;
else root.TP = api;
})(this);
