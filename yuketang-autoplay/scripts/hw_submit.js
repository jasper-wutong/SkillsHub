/**
 * yuketang-autoplay: 作业自动作答 + 提交脚本
 * 用法: node hw_submit.js <classroom_id> <leaf_id> <sku_id> <answers> <cookie_file> [out_dir]
 *
 * 参数：
 *   classroom_id  - 教室 ID
 *   leaf_id       - 作业 leaf ID
 *   sku_id        - 作业 SKU ID
 *   answers       - 答案字符串，如 "DCDDD"（5题）或 "ABCDA"
 *   cookie_file   - Cookie 文件路径
 *   out_dir       - 截图输出目录（可选）
 *
 * 功能：
 * - 逐题选择答案并提交（雨课堂是逐题提交制）
 * - 自动识别当前进度，跳过已提交的题目
 * - 每题提交后截图确认
 */
const { chromium } = require('playwright');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const CLASSROOM_ID = process.argv[2] || '3179486';
const HW_LEAF_ID = process.argv[3] || '5699156';
const HW_SKU_ID = process.argv[4] || '893998';
const ANSWERS = (process.argv[5] || 'DCDDD').toUpperCase().split('');
const COOKIE_FILE = process.argv[6] || 'artifacts/yuketang/manual-cookies-full.json';
const OUT_DIR = process.argv[7] || 'artifacts/yuketang';

async function getCurrentQNum(page) {
  return await page.evaluate(() => {
    const h = document.querySelector('.item-type');
    if (!h) return null;
    const m = h.textContent.match(/(\d+)\./);
    return m ? parseInt(m[1]) : null;
  });
}

async function getCompletedCount(page) {
  return await page.evaluate(() => {
    const badge = document.querySelector('[class*="badge"]');
    if (badge) { const m = badge.textContent.match(/^(\d+)\//); if (m) return parseInt(m[1]); }
    return 0;
  });
}

async function clickNextArrow(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('[class]')) {
      const cls = String(el.className || '');
      if (cls.includes('arrow-right') || cls.includes('el-icon-arrow-right')) { el.click(); return; }
    }
  });
  await sleep(2500);
}

async function getOptionPositions(page) {
  return await page.evaluate(() => {
    return Array.from(document.querySelectorAll('label.el-radio')).map(label => {
      const inner = label.querySelector('.el-radio__inner');
      const letterSpan = label.querySelector('.radioInput');
      const rect = inner ? inner.getBoundingClientRect() : null;
      return {
        letter: letterSpan ? letterSpan.textContent.trim() : '?',
        cx: rect ? Math.round(rect.x + rect.width / 2) : null,
        cy: rect ? Math.round(rect.y + rect.height / 2) : null,
      };
    });
  });
}

async function submitCurrentQuestion(page) {
  const submitPos = await page.evaluate(() => {
    for (const btn of document.querySelectorAll('button')) {
      const txt = (btn.textContent || '').trim();
      const rect = btn.getBoundingClientRect();
      if (txt === '提交' && rect.width > 60 && rect.y > 900)
        return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2) };
    }
    return { x: 400, y: 1066 };
  });
  await page.mouse.click(submitPos.x, submitPos.y);
  await sleep(2000);

  // 确认弹窗
  const confirmPos = await page.evaluate(() => {
    for (const btn of document.querySelectorAll('button')) {
      const txt = (btn.textContent || '').trim();
      const cls = String(btn.className || '');
      const rect = btn.getBoundingClientRect();
      if (rect.width > 0 && (txt === '确定' || txt === '确认提交' || (txt === '提交' && cls.includes('primary'))))
        return { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2), txt };
    }
    return null;
  });
  if (confirmPos) {
    await page.mouse.click(confirmPos.x, confirmPos.y);
    await sleep(2500);
    return 'confirmed: ' + confirmPos.txt;
  }
  return 'submitted';
}

(async () => {
  const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-gpu']
  });
  const context = await browser.newContext({
    viewport: { width: 800, height: 1100 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
  });
  await context.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
  await context.addCookies(cookies);

  const page = await context.newPage();
  await page.goto(
    `https://pro.yuketang.cn/bindmobile/cloud/exercise/cover/${CLASSROOM_ID}/${HW_LEAF_ID}/${HW_SKU_ID}`,
    { waitUntil: 'networkidle', timeout: 60000 }
  );
  await sleep(3000);

  // 点开始/继续作答
  const btn = page.getByText(/[开继]始?作答/, { exact: false });
  const hasbtn = await btn.count();
  if (!hasbtn) { console.error('找不到作答按钮'); await browser.close(); return; }
  await btn.first().click();
  console.log('等待题目加载（15秒）...');
  await sleep(15000);

  // 已完成多少题
  const alreadyDone = await getCompletedCount(page);
  console.log(`已完成: ${alreadyDone}/${ANSWERS.length}`);

  // 导航到第一道未提交题目
  let curQ = await getCurrentQNum(page);
  while (curQ !== null && curQ <= alreadyDone) {
    await clickNextArrow(page);
    curQ = await getCurrentQNum(page);
  }

  // 逐题作答
  for (let i = alreadyDone; i < ANSWERS.length; i++) {
    const qNum = i + 1;
    const answer = ANSWERS[i];
    console.log(`\n=== 第 ${qNum} 题，选 ${answer} ===`);

    curQ = await getCurrentQNum(page);
    while (curQ !== null && curQ < qNum) {
      await clickNextArrow(page);
      curQ = await getCurrentQNum(page);
    }

    await sleep(1000);
    const positions = await getOptionPositions(page);
    console.log('  选项:', JSON.stringify(positions));

    const target = positions.find(p => p.letter === answer);
    if (!target || !target.cx) { console.log(`  ❌ 找不到 ${answer}`); continue; }

    await page.mouse.click(target.cx, target.cy);
    await sleep(1500);

    const state = await page.evaluate(() =>
      Array.from(document.querySelectorAll('label.el-radio')).map(l => ({
        l: l.querySelector('.radioInput')?.textContent?.trim(),
        c: l.classList.contains('is-checked')
      }))
    );
    const selected = state.find(s => s.c);
    console.log(`  选中: ${selected?.l || '无'}`);

    if (!selected) { console.log('  ⚠️ 未选中，跳过提交'); continue; }

    await page.screenshot({ path: `${OUT_DIR}/hw-submit-q${qNum}.png` });
    const res = await submitCurrentQuestion(page);
    console.log(`  提交: ${res}`);

    curQ = await getCurrentQNum(page);
    console.log(`  提交后当前题号: ${curQ}`);
  }

  await sleep(2000);
  await page.screenshot({ path: `${OUT_DIR}/hw-submit-final.png` });
  const finalText = (await page.locator('body').innerText().catch(() => '')).trim().slice(0, 200);
  console.log('\n最终页面:', finalText);

  await browser.close();
  console.log('\n✅ Done.');
})();
