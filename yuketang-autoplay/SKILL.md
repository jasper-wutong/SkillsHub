---
name: yuketang-autoplay
description: 雨课堂（pro.yuketang.cn）自动化工具。支持：(1) 自动播放课程视频（全部或指定范围）；(2) 查看作业题目内容（截图方式绕过字体加密）；(3) 自动作答并提交作业（逐题选择+提交）；(4) 获取课程结构（视频/作业列表及 ID）。用于 Jasper 的会计课程自动化。Use when user asks to play yuketang videos, view homework questions, submit homework answers, or check course/homework progress.
---

# 雨课堂自动化 Skill

## 环境要求

- Node.js + Playwright（`npx playwright install chromium`）
- Cookie 文件：`artifacts/yuketang/manual-cookies-full.json`（Playwright JSON 格式）
- 工作目录：`/root/.openclaw/workspace`

## 常用 IDs（Jasper 的会计课）

| 变量 | 值 |
|------|----|
| classroom_id | `3179486` |
| sku_id | `893998` |
| cookie_file | `artifacts/yuketang/manual-cookies-full.json` |
| out_dir | `artifacts/yuketang` |

具体的 leaf_id 需通过 `get_course_structure.js` 查询，或参考已知映射（见 references/api-reference.md）。

---

## 工作流

### 1. 获取课程结构（视频 + 作业列表）

```bash
node skills/yuketang-autoplay/scripts/get_course_structure.js <classroom_id> <cookie_file>
```

输出：`artifacts/yuketang/course-structure-<classroom_id>.json`  
包含所有视频和作业的 leafId、顺序、标题、截止时间。

**何时使用**：用户问"有哪些作业"、"查一下课程目录"时先执行。

---

### 2. 自动播放视频

```bash
nohup node skills/yuketang-autoplay/scripts/video_autoplay.js <classroom_id> <cookie_file> [start_index] > artifacts/yuketang/autoplay-stdout.log 2>&1 &
echo $!
```

- `start_index`：从第几个视频开始（默认 1）
- 支持断点续播：ctrl+c 后重启时传入 start_index
- 状态文件：`artifacts/yuketang/autoplay-v3-status.json`
- 防多实例：lock file 保护

**查看进度**：
```bash
cat artifacts/yuketang/autoplay-v3-status.json
```

---

### 3. 查看作业题目（截图）

```bash
node skills/yuketang-autoplay/scripts/hw_screenshot.js <classroom_id> <leaf_id> <sku_id> <cookie_file> <out_dir>
```

输出：`<out_dir>/hw-q1.png` ~ `hw-qN.png`（每道题一张截图）

⚠️ **作业页面用移动端 UA**，否则题目内容不渲染（已在脚本中配置）。

截图后将图片 read 进 context，即可分析题目内容并给出答案。

---

### 4. 自动作答 + 提交

先截图分析题目，确定答案后运行：

```bash
node skills/yuketang-autoplay/scripts/hw_submit.js <classroom_id> <leaf_id> <sku_id> <answers> <cookie_file> <out_dir>
```

- `answers`：答案字符串，如 `DCDDD`（每个字符对应一道题）
- 脚本自动识别已提交进度，从断点继续

**示例（2.1 作业，5题，答案 DCDDD）**：
```bash
node skills/yuketang-autoplay/scripts/hw_submit.js 3179486 5699156 893998 DCDDD artifacts/yuketang/manual-cookies-full.json artifacts/yuketang
```

**提交验证**：看最终截图 `hw-submit-final.png`，确认"已提交"按钮和答题卡 N/N。

---

### 5. 标准分析作业流程（完整）

1. 运行 `get_course_structure.js` 找到目标作业的 leafId
2. 运行 `hw_screenshot.js` 截图所有题目
3. 用 `read` 工具加载截图，分析题目，确定答案
4. **向 Jasper 展示题目和答案，请求确认**
5. 确认后运行 `hw_submit.js` 提交
6. 提交完成后，**自动生成学习资料并直接发到对话里**（见下一节）

### 6. 提交后自动生成学习资料（强制步骤）

在作业提交成功（答题卡 N/N）后，立即执行：

1. 基于本次题目截图 + 最终答案，整理本次考察主题
2. 按 `references/study-pack-template.md` 结构生成完整学习资料
3. 输出要求：
   - 用中文、结构化小标题
   - 聚焦“可迁移的判别规则”，不是只报答案
   - 给出易错点与口诀
   - 如用户愿意，附 3 道自测题
4. **直接在当前对话发送**，不需要用户再次催促

---

## 参考资料

- **API 接口、已知坑、ID 说明**：见 `references/api-reference.md`
- **学习资料模板**：见 `references/study-pack-template.md`
- 特别注意：字体加密、className SVG 报错、逐题提交机制

## 注意事项

- 作业提交前**必须获得 Jasper 确认**（涉及真实学业记录）
- Cookie 过期时需重新手动登录导出
- 视频播放用 `nohup` 后台运行，不要阻塞主对话
- 提交后学习资料是默认动作，除非 Jasper 明确说“先不生成”
