// 引擎測試：node tools/test_engine.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const T = require('../data.js');
let pass = 0, fail = 0;
function ok(c, msg){ if(c) pass++; else { fail++; console.log('✗ ' + msg); } }
const M = T.MIN;
const at = (h, m) => new Date(2026, 10, 18, h, m).getTime();

// 時間文字
ok(T.hm('09:05') === 545 && T.hm('9：05') === 545 && T.hm('25:00') === null && T.hm('') === null, 'hm');
ok(T.hmText(545) === '09:05' && T.hmText(1440 + 30) === '00:30', 'hmText');
ok(T.mmss(65000) === '1:05' && T.mmss(-65000) === '+1:05' && T.mmss(3725000) === '1:02:05', 'mmss ' + T.mmss(3725000));
ok(T.durText(45) === '45 分' && T.durText(90) === '1 小時 30 分' && T.durText(120) === '2 小時', 'durText');

// 範例：總長剛好、排課檢查乾淨、都有可刪減
for(const e of T.EXAMPLES){
  const p = T.normalize(e.p), sc = T.schedule(p);
  ok(sc.avail === sc.total, e.id + ' 總長等於表定 ' + sc.total + '/' + sc.avail);
  ok(T.checks(p).length === 0, e.id + ' 排課檢查 ' + JSON.stringify(T.checks(p)));
  ok(p.segs.some(s => s.opt), e.id + ' 有可刪減段落');
  ok(p.segs.every(s => s.t && s.min > 0 && T.TYPES[s.type]), e.id + ' 段落完整');
}

// 排課檢查
const bad = T.normalize({start:'09:00', end:'10:00', talkMax:20, segs:[{t:'A', min:30, type:'talk'}, {t:'B', min:15, type:'talk'}, {t:'', min:30, type:'practice'}]});
const ck = T.checks(bad).map(c => c.t).join('|');
ok(/多 15 分鐘/.test(ck), '超時檢查 ' + ck);
ok(/第 1～2 段連續講授 45 分鐘/.test(ck), '連續講授檢查');
ok(/第 3 段還沒有標題/.test(ck), '空標題檢查');
const nob = T.normalize({start:'09:00', segs:Array.from({length:5}, (_, i) => ({t:'S' + i, min:30, type:i % 2 ? 'practice' : 'talk'}))});
ok(T.checks(nob).some(c => /沒休息/.test(c.t)), '超過 2 小時沒休息');
ok(T.checks(T.blank())[0].lv === 'bad', '沒段落');
ok(T.schedule(T.normalize({start:'23:30', end:'00:30', segs:[{t:'x', min:60}]})).diff === 0, '跨午夜表定');

// 大綱解析
const o1 = T.parseOutline('開場與破冰 10\n實作練習｜20分\n午餐 1小時\n問答 Q&A 15\n分組討論, 25 min\n沒時間的段落');
ok(o1.map(s => s.min).join() === '10,20,60,15,25,15', '分鐘解析 ' + o1.map(s => s.min).join());
ok(o1.map(s => s.type).join() === 'interact,practice,break,qa,discuss,talk', '類型猜測 ' + o1.map(s => s.type).join());
ok(T.parseOutline('開場｜0.5\n社群定位｜1.5').map(s => s.min).join() === '30,90', '全部小數字當小時');
ok(T.parseOutline('A｜1.5', false)[0].min === 2, '指定分鐘單位');
ok(T.parseOutline('A｜10\nB｜1', null).map(s => s.min).join() === '10,1', '有大於 8 的數字就當分鐘');

// 上課流程
const p = T.normalize(T.EXAMPLES[0].p);
let n = at(9, 1), L = T.startLive(p, n);
ok(!L.rel && T.clock(L.plannedEnd) === '12:00', '準時開始用表定下課');
ok(T.startLive(p, at(14, 0)).rel, '差很多時改用實際開始');
let s = T.status(p, L, n);
ok(s.i === 0 && s.remain === 10 * M && s.phase === 'ok' && s.delta === 1, '開始狀態 delta=' + s.delta);
n += 8.5 * M; s = T.status(p, L, n); ok(s.phase === 'warn', '剩 1.5 分變黃');
n += 3 * M; s = T.status(p, L, n); ok(s.phase === 'over' && s.remain === -1.5 * M, '超時變紅');
ok(s.delta === 3, '超時 1.5 分加上晚 1 分開始 → 落後約 3 分，實得 ' + s.delta);
T.togglePause(L, n); const before = T.status(p, L, n).el; n += 5 * M;
ok(T.status(p, L, n).el === before && T.status(p, L, n).paused, '暫停時不計時');
T.togglePause(L, n); n += 1 * M; ok(T.status(p, L, n).el === before + M, '繼續後計時');
T.next(p, L, n); ok(L.idx === 1 && L.log.length === 1, '下一段');
ok(Math.abs(T.actualMs(L, 0) - 12.5 * M) < 1, '實際時間扣掉暫停 ' + T.actualMs(L, 0) / M);
T.prev(p, L, n + 1000); ok(L.idx === 0, '上一段'); T.next(p, L, n + 2000); ok(L.idx === 1, '再下一段');
n += 2000;
T.adjust(p, L, 5); ok(T.segMin(p, L, 1) === 25, '+5 分'); T.adjust(p, L, -100); ok(T.segMin(p, L, 1) === 1, '最少 1 分');
T.adjust(p, L, 19);
// 連續講授提醒
n += 21 * M; s = T.status(p, L, n); ok(s.talkNudge && s.talkStreak >= 20 * M, '講授 21 分提醒互動');

// 刪減建議
const sug = T.suggestCuts(p, L, 15);
ok(sug.enough && sug.acts.every(a => a.a === 'skip' && p.segs[a.i].opt) && sug.covered === 20, '落後 15：刪兩段可刪減 ' + JSON.stringify(sug));
const sug2 = T.suggestCuts(p, L, 8);
ok(sug2.acts.length === 1 && sug2.covered === 10, '落後 8：只刪一段');
const sug3 = T.suggestCuts(p, L, 30);
ok(sug3.acts.some(a => a.a === 'shrink') && sug3.acts.every(a => a.a === 'skip' || p.segs[a.i].type !== 'talk'), '落後 30：刪完再壓縮非講授 ' + JSON.stringify(sug3.acts));
ok(sug3.acts.filter(a => a.a === 'shrink').every(a => T.segMin(p, L, a.i) - a.m >= 5), '壓縮後每段至少 5 分');
ok(T.suggestCuts(p, L, 0) === null && T.suggestCuts(p, L, -3) === null, '沒落後不建議');
const L2 = JSON.parse(JSON.stringify(L)); const d0 = T.status(p, L2, n).delta;
T.applyCuts(L2, sug); ok(T.status(p, L2, n).delta === d0 - 20, '套用後預計下課提早 20 分');
ok(!L2.skip[L2.idx], '目前這段不會被刪');
const huge = T.suggestCuts(p, L, 500); ok(!huge.enough && huge.covered < 500, '刪不夠時標示不足');

// 跑完課程與報告
for(let k = 0; k < 20 && !L.done; k++){ n += 10 * M; T.next(p, L, n); }
ok(L.done && L.idx === -1, '最後一段後結束');
const st = T.status(p, L, n); ok(st.done, 'status done');
const r = T.report(p, L);
ok(r.rows.length === p.segs.length && r.rows.every(x => x.ran), '報告每段都有上到');
ok(r.rows[0].act === 12.5 && r.rows[0].diff === 2.5, '第一段實際 12.5 分 ' + r.rows[0].act);
ok(r.tips.length > 0 && r.tips.some(t => /ChatGPT 基本操作/.test(t)), '報告建議 ' + r.tips.join('|'));
const csv = T.reportCsv(p, r).split('\r\n');
ok(csv.length === p.segs.length + 2 && csv[0].startsWith('#,段落'), 'CSV 行數');
// 刪減後報告標示
const L3 = T.startLive(p, at(9, 0)); L3.skip[5] = true; let n3 = at(9, 0);
for(let k = 0; k < 20 && !L3.done; k++){ n3 += 5 * M; T.next(p, L3, n3); }
const r3 = T.report(p, L3); ok(r3.rows[5].skipped && !r3.rows[5].ran && r3.tips.some(t => /刪掉了/.test(t)), '刪減段落標示與建議');

// normalize 防呆
const z = T.normalize({start:'abc', warn:999, segs:[{t:'x'.repeat(100), min:-5, type:'zzz'}, null]});
ok(z.start === '09:00' && z.warn === 2 && z.segs[0].t.length === 60 && z.segs[0].min === 1 && z.segs[0].type === 'talk' && z.segs.length === 2, 'normalize');

console.log(`通過 ${pass}，失敗 ${fail}`);
process.exit(fail ? 1 : 0);
