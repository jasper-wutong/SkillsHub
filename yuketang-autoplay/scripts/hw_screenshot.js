/**
 * yuketang-autoplay: 作业截图脚本
 * 用法: node hw_screenshot.js <classroom_id> <leaf_id> <sku_id> <cookie_file> [out_dir]
 *
 * 功能：截取作业每道题的截图（绕过字体加密，浏览器渲染后截图）
 * 输出：out_dir/hw-q1.png ~ hw-qN.png
 */
const { chromium } = require('playwright');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const CLASSROOM_ID = process.argv[2] || '3179486';
const HW_LEAF_ID = process.argv[3] || '5699156';
const HW_SKU_ID = process.argv[4] || '893998';
const COOKIE_FILE = process.argv[5] || 'artifacts/yuketang/manual-cookies-full.json';
const OUT_DIR = process.argv[6] || 'artifacts/yuketang';

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
  const coverUrl = `https://pro.yuketang.cn/bindmobile/cloud/exercise/cover/${CLASSROOM_ID}/${HW_LEAF_ID}/${HW_SKU_ID}`;

  await page.goto(coverUrl, { waitUntil: 'networkidle', timeout: 60000 });
  await sleep(3000);

  // 点击开始/继续作答
  const startBtn = page.getByText(/[开继]始?作答/, { exact: false });
  const hasStart = await startBtn.count();
  if (!hasStart) { console.error('找不到作答按钮'); await browser.close(); return; }
  await startBtn.first().click();
  console.log('等待题目加载（15秒）...');
  await sleep(15000);

  // 获取总题目数
  const totalQ = await page.evaluate(() => {
    const badge = document.querySelector('[class*="badge"]');
    if (badge) { const m = badge.textContent.match(/\/(\d+)/); if (m) return parseInt(m[1]); }
    return 10; // 默认最多截10题
  });
  console.log('总题目数:', totalQ);

  const results = [];
  for (let i = 1; i <= totalQ; i++) {
    await sleep(1200);
    await page.screenshot({ path: `${OUT_DIR}/hw-q${i}.png`, fullPage: false });
    console.log(`✅ hw-q${i}.png`);
    results.push(`${OUT_DIR}/hw-q${i}.png`);

    if (i < totalQ) {
      // 翻页
      await page.evaluate(() => {
        for (const el of document.querySelectorAll('[class]')) {
          const cls = String(el.className || '');
          if (cls.includes('arrow-right') || cls.includes('el-icon-arrow-right')) { el.click(); return; }
        }
      });
      await sleep(3000);
    }
  }

  await browser.close();
  console.log('\n截图完成:', results.join(', '));
})();
