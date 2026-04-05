/**
 * yuketang-autoplay: 获取课程结构（视频列表 + 作业列表）
 * 用法: node get_course_structure.js <classroom_id> <cookie_file> [out_file]
 *
 * 输出 JSON 文件，包含所有视频和作业的 leafId、顺序、标题
 */
const { chromium } = require('playwright');
const fs = require('fs');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const CLASSROOM_ID = process.argv[2] || '3179486';
const COOKIE_FILE = process.argv[3] || 'artifacts/yuketang/manual-cookies-full.json';
const OUT_FILE = process.argv[4] || `artifacts/yuketang/course-structure-${CLASSROOM_ID}.json`;

(async () => {
  const cookies = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36'
  });
  await context.addCookies(cookies);
  const page = await context.newPage();
  await page.goto(`https://pro.yuketang.cn/v2/web/studentLog/${CLASSROOM_ID}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);

  // 拉取所有 activity（分页）
  const allActivities = await page.evaluate(async (classroomId) => {
    let all = [], pageNum = 0, prevId = null;
    while (true) {
      const url = prevId
        ? `https://pro.yuketang.cn/v2/api/web/logs/learn/${classroomId}?actype=-1&page=${pageNum}&offset=50&sort=-1&prev_id=${prevId}`
        : `https://pro.yuketang.cn/v2/api/web/logs/learn/${classroomId}?actype=-1&page=${pageNum}&offset=50&sort=-1`;
      const r = await fetch(url, { credentials: 'include' });
      const data = await r.json();
      const acts = data.data?.activities || [];
      if (!acts.length) break;
      all = all.concat(acts);
      prevId = data.data.prev_id;
      pageNum++;
      if (pageNum > 20) break;
    }
    return all;
  }, CLASSROOM_ID);

  // 按 id 升序排列（发布顺序）
  allActivities.sort((a, b) => a.id - b.id);

  const withContent = allActivities.filter(a => a && a.content);

  const videos = withContent.filter(a => a.type === 17).map((a, i) => ({
    index: i + 1,
    type: 'video',
    title: a.title,
    leafId: a.content?.leaf_id ?? null,
    skuId: a.content?.sku_id ?? null,
    scoreDeadline: a.content?.score_d ? new Date(a.content.score_d).toISOString() : null,
  }));
  const homeworks = withContent.filter(a => a.type === 19).map((a, i) => ({
    index: i + 1,
    type: 'homework',
    title: a.title,
    leafId: a.content?.leaf_id ?? null,
    skuId: a.content?.sku_id ?? null,
    leafTypeId: a.content?.leaf_type_id ?? null,
    scoreDeadline: a.content?.score_d ? new Date(a.content.score_d).toISOString() : null,
  }));

  // 合并顺序表（忽略没有 content 的章节封面/目录项）
  const ordered = withContent.map(a => ({
    type: a.type === 17 ? 'video' : a.type === 19 ? 'homework' : 'other',
    title: a.title,
    leafId: a.content?.leaf_id ?? null,
    skuId: a.content?.sku_id ?? null,
    scoreDeadline: a.content?.score_d ? new Date(a.content.score_d).toISOString() : null,
  }));

  const result = { classroomId: CLASSROOM_ID, videos, homeworks, ordered };
  fs.writeFileSync(OUT_FILE, JSON.stringify(result, null, 2));

  console.log(`✅ 课程结构已保存: ${OUT_FILE}`);
  console.log(`   视频: ${videos.length} 个`);
  console.log(`   作业: ${homeworks.length} 个`);
  videos.forEach(v => console.log(`  📹 ${v.index}. ${v.title} (leafId:${v.leafId})`));
  console.log('--- 作业 ---');
  homeworks.forEach(h => console.log(`  📝 作业 leafId:${h.leafId} sku:${h.skuId} 截止:${h.scoreDeadline}`));

  await browser.close();
})();
