/**
 * yuketang-autoplay: 视频自动播放脚本
 * 用法: node video_autoplay.js <classroom_id> <cookie_file> [start_index]
 *
 * 功能：
 * - 自动播放指定教室的所有未完成视频
 * - 15秒心跳推进进度，支持断点续播
 * - 多实例防重（PID lockfile）
 * - 状态持久化到 status.json
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const CLASSROOM_ID = process.argv[2] || '3179486';
const COOKIE_FILE = process.argv[3] || 'artifacts/yuketang/manual-cookies-full.json';
const START_INDEX = parseInt(process.argv[4] || '1', 10);
const OUT_DIR = process.env.OUT_DIR || 'artifacts/yuketang';
const LOCK_FILE = path.join(OUT_DIR, 'autoplay-v3.lock');
const STATUS_FILE = path.join(OUT_DIR, 'autoplay-v3-status.json');
const LOG_FILE = path.join(OUT_DIR, 'autoplay-v3-log.json');

// ---- 防多实例 ----
if (fs.existsSync(LOCK_FILE)) {
  const pid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8').trim());
  try { process.kill(pid, 0); console.error(`Already running (PID ${pid})`); process.exit(1); } catch(e) {}
}
fs.writeFileSync(LOCK_FILE, String(process.pid));
process.on('exit', () => { try { fs.unlinkSync(LOCK_FILE); } catch(e) {} });
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

// ---- 获取课程视频列表 ----
async function getVideoList(page) {
  const result = await page.evaluate(async (classroomId) => {
    let all = [], page_num = 0, prevId = null;
    while (true) {
      const url = prevId
        ? `https://pro.yuketang.cn/v2/api/web/logs/learn/${classroomId}?actype=-1&page=${page_num}&offset=50&sort=-1&prev_id=${prevId}`
        : `https://pro.yuketang.cn/v2/api/web/logs/learn/${classroomId}?actype=-1&page=${page_num}&offset=50&sort=-1`;
      const r = await fetch(url, { credentials: 'include' });
      const data = await r.json();
      const acts = data.data?.activities || [];
      if (!acts.length) break;
      all = all.concat(acts);
      prevId = data.data.prev_id;
      page_num++;
      if (page_num > 20) break;
    }
    return all.filter(a => a.type === 17).sort((a,b) => a.id - b.id).map((a, i) => ({
      index: i + 1,
      title: a.title,
      leafId: a.content.leaf_id,
      skuId: a.content.sku_id,
    }));
  }, CLASSROOM_ID);
  return result;
}

// ---- 播放单个视频 ----
async function playVideo(page, video) {
  const url = `https://pro.yuketang.cn/bindmobile/video-student-unit/${CLASSROOM_ID}/${video.leafId}`;
  console.log(`\n[${video.index}] 打开: ${video.title} (leafId:${video.leafId})`);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  // 获取视频时长
  let duration = await page.evaluate(() => {
    const v = document.querySelector('video');
    return v ? Math.round(v.duration) : 0;
  }).catch(() => 0);

  if (!duration) {
    await sleep(5000);
    duration = await page.evaluate(() => {
      const v = document.querySelector('video');
      return v ? Math.round(v.duration) : 0;
    }).catch(() => 0);
  }

  // 从 API 获取视频信息（包含时长）
  if (!duration) {
    const leafInfo = await page.evaluate(async (cid, lid) => {
      const r = await fetch(`https://pro.yuketang.cn/mooc-api/v1/lms/learn/leaf_info/${cid}/${lid}/`, { credentials: 'include' });
      return await r.json();
    }, CLASSROOM_ID, video.leafId).catch(() => ({}));
    duration = leafInfo?.data?.duration || 0;
  }

  console.log(`  时长: ${duration}s`);

  // 快速跳到结尾（跳过秒）
  if (duration > 30) {
    await page.evaluate((d) => {
      const v = document.querySelector('video');
      if (v) v.currentTime = d - 5;
    }, duration).catch(() => {});
    await sleep(2000);
  }

  // 推进心跳直到结束
  const endTime = Date.now() + Math.max(duration * 1000, 20000);
  while (Date.now() < endTime) {
    const pos = await page.evaluate(() => {
      const v = document.querySelector('video');
      return v ? { cur: Math.round(v.currentTime), dur: Math.round(v.duration), paused: v.paused } : null;
    }).catch(() => null);
    if (pos) {
      if (pos.paused) await page.evaluate(() => document.querySelector('video')?.play()).catch(() => {});
      console.log(`  进度: ${pos.cur}/${pos.dur}s`);
      if (pos.dur > 0 && pos.cur >= pos.dur - 3) break;
    }
    await sleep(15000);
  }

  // 标记完成
  await page.evaluate(async (cid, lid) => {
    await fetch(`https://pro.yuketang.cn/mooc-api/v1/lms/learn/leaf_finished/${cid}/${lid}/`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ leaf_id: lid })
    }).catch(() => {});
  }, CLASSROOM_ID, video.leafId).catch(() => {});

  return { leafId: video.leafId, title: video.title, duration };
}

// ---- 主流程 ----
(async () => {
  const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-gpu']
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36',
    locale: 'zh-CN', timezoneId: 'Asia/Shanghai',
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
  });
  await context.addCookies(cookies);

  const page = await context.newPage();

  // 访问课程页面激活 session
  await page.goto(`https://pro.yuketang.cn/v2/web/studentLog/${CLASSROOM_ID}`, {
    waitUntil: 'domcontentloaded', timeout: 30000
  });
  await sleep(3000);

  // 获取视频列表
  console.log('获取课程视频列表...');
  const videos = await getVideoList(page);
  console.log(`共 ${videos.length} 个视频`);
  fs.writeFileSync(LOG_FILE, JSON.stringify({ items: videos }, null, 2));

  const completed = [];
  const startIdx = START_INDEX - 1;

  for (let i = startIdx; i < videos.length; i++) {
    const video = videos[i];
    // 更新状态
    fs.writeFileSync(STATUS_FILE, JSON.stringify({
      current: video.index, total: videos.length,
      title: video.title, leafId: video.leafId,
      completed: completed.length, pid: process.pid,
      updatedAt: new Date().toISOString()
    }, null, 2));

    try {
      const result = await playVideo(page, video);
      completed.push(result);
      console.log(`  ✅ 完成 ${video.title}`);
    } catch (e) {
      console.error(`  ❌ 错误: ${video.title}: ${e.message}`);
    }
  }

  fs.writeFileSync(STATUS_FILE, JSON.stringify({
    done: true, total: videos.length, completed: completed.length,
    finishedAt: new Date().toISOString()
  }, null, 2));

  await browser.close();
  console.log(`\n✅ 全部完成！共 ${completed.length}/${videos.length} 个视频`);
})();
