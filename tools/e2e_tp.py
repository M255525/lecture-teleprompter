# 端對端測試：先開 8894（或設 TP_BASE 測線上版），python tools/e2e_tp.py [輸出資料夾]
# 用 window._tp.skip(ms) 快轉時間，不必真的等。
import asyncio, io, os, sys, tempfile
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', line_buffering=True)
from playwright.async_api import async_playwright

BASE = os.environ.get('TP_BASE', 'http://localhost:8894/').rstrip('/') + '/'
OUT = sys.argv[1] if len(sys.argv) > 1 else tempfile.mkdtemp()
os.makedirs(OUT, exist_ok=True)
R = []
def ok(c, m):
    R.append(bool(c)); print(('✓ ' if c else '✗ ') + m)
MIN = 60000

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1366, 'height': 900}, accept_downloads=True)
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'visitor-badge' not in m.text and 'script.google' not in m.text else None)
        await pg.goto(BASE + 'index.html'); await pg.wait_for_timeout(1000)
        ok(await pg.is_visible('#modal.show') and '使用警語' in await pg.inner_text('#modalBox'), '首訪跳出使用警語')
        await pg.click('[data-act="close"]')
        foot = await pg.inner_html('.foot2')
        ok(all(k in foot for k in ['manual.html', '#creator', 'data-act="warn"', 'visitor-badge']), '頁尾五件套入口')
        ok(len(await pg.query_selector_all('.seg')) == 11, '首訪載入範例 11 段')
        ok('沒問題' in await pg.inner_text('#checks'), '範例排課檢查通過')

        # 排課編輯
        first = pg.locator('.seg input[data-s="min"]').first
        await first.fill('40'); await pg.wait_for_timeout(300)
        ok('多 30 分鐘' in await pg.inner_text('#checks'), '改分鐘數即時檢查超時')
        await first.fill('10'); await pg.wait_for_timeout(300)
        await pg.click('[data-act="paste"]')
        await pg.fill('#pasteBox', '開場 5\n講授一 25\n練習 15\n休息 10')
        await pg.click('[data-act="pasteAppend"]'); await pg.wait_for_timeout(200)
        ok(len(await pg.query_selector_all('.seg')) == 15, '貼上大綱接在後面')
        types = await pg.eval_on_selector_all('.seg select[data-s="type"]', 'e=>e.slice(-2).map(x=>x.value)')
        ok(types == ['practice', 'break'], '大綱類型猜測 ' + str(types))
        ok('講授 25 分鐘' in await pg.inner_text('#checks') or '連續講授' in await pg.inner_text('#checks'), '連續講授提醒')
        await pg.click('[data-ex="ai"]'); await pg.wait_for_timeout(200)
        await pg.click('[data-act="savePlan"]'); await pg.wait_for_timeout(200)
        ok(len(await pg.query_selector_all('.pitem')) == 1, '存到我的課程')
        async with pg.expect_download() as d: await pg.click('.card [data-act="exportPlans"]')
        ok((await d.value).suggested_filename.endswith('.json'), '匯出課程')

        # 上課
        await pg.click('[data-act="start"]'); await pg.wait_for_timeout(500)
        ok(await pg.evaluate("document.body.classList.contains('live')") and await pg.is_visible('#lCd'), '進入上課畫面')
        ok('開場與破冰' in await pg.inner_text('.now .tt'), '顯示第一段')
        await pg.evaluate(f'window._tp.skip({8.5 * MIN})'); await pg.wait_for_timeout(400)
        ok('warn' in await pg.get_attribute('#lNow', 'class'), '剩 1.5 分變黃')
        await pg.evaluate(f'window._tp.skip({14 * MIN})'); await pg.wait_for_timeout(400)
        cls = await pg.get_attribute('#lNow', 'class')
        ok('over' in cls and (await pg.inner_text('#lCd')).startswith('+'), '超時變紅並顯示 +')
        ban = await pg.inner_text('#lBan')
        ok('預計落後' in ban and '案例補充' in ban, '落後時跳出刪減建議')
        await pg.screenshot(path=os.path.join(OUT, 'live_late.png'))
        await pg.click('[data-act="applyCut"]'); await pg.wait_for_timeout(400)
        ok(len(await pg.query_selector_all('.rail button.skip')) >= 1, '套用後段落標成刪除')
        await pg.keyboard.press('PageDown'); await pg.wait_for_timeout(300)
        ok('ChatGPT 基本操作' in await pg.inner_text('.now .tt'), 'PageDown 下一段')
        await pg.keyboard.press('PageDown'); await pg.wait_for_timeout(200)
        ok('ChatGPT 基本操作' in await pg.inner_text('.now .tt'), '0.7 秒內連按只算一次')
        await pg.keyboard.press('b'); await pg.wait_for_timeout(200)
        ok(await pg.get_attribute('.ctl .ps', 'aria-pressed') == 'true', 'B 鍵暫停')
        await pg.keyboard.press('b'); await pg.keyboard.press('+'); await pg.wait_for_timeout(200)
        ok('已調整 +1' in await pg.inner_text('.now .meta'), '+ 鍵加 1 分')
        await pg.evaluate(f'window._tp.skip({21 * MIN})'); await pg.wait_for_timeout(400)
        ok('連續講了' in await pg.inner_text('#lBan'), '講授 20 分提醒互動')
        # 重新整理接續
        await pg.reload(); await pg.wait_for_timeout(800)
        await pg.evaluate(f'window._tp.skip({43.5 * MIN})'); await pg.wait_for_timeout(300)  # 快轉時間不會跨重新整理保留，補回去
        ok(await pg.evaluate("document.body.classList.contains('live')") and 'ChatGPT 基本操作' in await pg.inner_text('.now .tt'), '重新整理後接著計時')
        # 跳段（點兩下）
        rail = pg.locator('.rail button').nth(9)
        await rail.click(); await pg.wait_for_timeout(150)
        ok('ChatGPT' in await pg.inner_text('.now .tt'), '點一下不會跳段')
        await pg.locator('.rail button').nth(9).click(); await pg.wait_for_timeout(300)
        ok('問答' in await pg.inner_text('.now .tt'), '點兩下跳到該段')
        await pg.evaluate('window._tp.resetNav()')
        await pg.evaluate(f'window._tp.skip({18 * MIN})')
        await pg.click('[data-act="next"]'); await pg.wait_for_timeout(300)
        await pg.evaluate('window._tp.resetNav()')
        await pg.click('[data-act="next"]'); await pg.wait_for_timeout(500)

        # 課後報告
        ok(await pg.evaluate('window._tp.VIEW') == 'report' and '課後' not in '' , '最後一段結束後到報告')
        rep = await pg.inner_text('#body')
        ok('案例補充' in rep and '刪減' in rep and '未上到' in rep, '報告標示刪減與未上到')
        ok('開場與破冰' in rep and '實際用了' in rep, '報告列出超時建議')
        ok(await pg.evaluate("[...document.querySelectorAll('.rtab td.n')].every(td=>!/^-\d/.test(td.textContent)||td.classList.contains('m'))"), '實際時間沒有負數')
        await pg.screenshot(path=os.path.join(OUT, 'report.png'), full_page=True)
        async with pg.expect_download() as d: await pg.click('[data-act="csv"]')
        t = open(await (await d.value).path(), encoding='utf-8-sig').read()
        ok(t.startswith('#,段落') and '刪減' in t, '下載 CSV')
        await pg.click('[data-act="applyActual"]'); await pg.wait_for_timeout(300)
        v = await pg.locator('.seg input[data-s="min"]').first.input_value()
        ok(v == '23', '實際時間套回排課（第一段 22.5→23）實得 ' + v)

        # 列印時間表
        await pg.evaluate("window.print=()=>{}")
        await pg.click('[data-act="print"]'); await pg.wait_for_timeout(200)
        ok(await pg.evaluate("document.querySelectorAll('#printArea tr').length") == 12, '列印時間表 11 段＋表頭')
        await pg.emulate_media(media='print'); await pg.pdf(path=os.path.join(OUT, 'timetable.pdf'), format='A4'); await pg.emulate_media(media='screen')

        # ⚙
        await pg.click('[data-act="settings"]')
        st = await pg.inner_text('#modalBox')
        ok(all(k in st for k in ['顯示', '提示音', '簡報筆', '我的課程', '清除全部資料', '關於本工具']), '⚙ 收合區塊齊全')
        ok(await pg.evaluate("document.querySelectorAll('.set-sec[open]').length") == 0, '⚙ 預設收合')
        await pg.click('[data-act="close"]')

        # 手機
        await pg.set_viewport_size({'width': 375, 'height': 812}); await pg.wait_for_timeout(300)
        ok(await pg.evaluate('document.documentElement.scrollWidth') <= 375, '375px 排課無橫向捲動')
        await pg.click('[data-act="start"]'); await pg.wait_for_timeout(500)
        ok(await pg.evaluate('document.documentElement.scrollWidth') <= 375, '375px 上課無橫向捲動')
        await pg.screenshot(path=os.path.join(OUT, 'mobile_live.png'))
        await pg.click('.lbar .clk'); await pg.wait_for_timeout(200)
        ok(not await pg.is_visible('#modal.show'), '點畫面空白處不會打開設定')
        ok(not errs, '無 console 錯誤 ' + '; '.join(errs[:3]))
        await b.close()
    print(f'\n{sum(R)}/{len(R)} 通過，輸出在 {OUT}')
    sys.exit(0 if all(R) else 1)

asyncio.run(main())
