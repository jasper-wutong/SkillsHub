---
name: sellside-news-insight
description: Analyze daily multi-source news with a senior sell-side financial analyst lens. Use when user asks things like "分析今天新闻", "今日新闻解读", "market color", or asks for deep macro/market insights from headline flows. Collect news via FetchNews fetch_* scripts first, then synthesize cross-asset implications, hidden drivers, scenario tree, and tradable takeaways.
---

Use this skill to turn daily headline flow into deep market insight.

## Step 0 - 分析前必须加载的系统状态（每次强制执行）

在做任何分析之前，先执行：

```bash
# 0. [硬闸门] 记录模型切换 + 初始化任务状态
python3 research-os/system_guardrails.py log-switch sonnet "news_analysis_$(date +%Y%m%d)"

# 1. 宏观状态机（本次信号解读的框架）
python3 research-os/regime_manager.py inject

# 2. 置信度校准（历史偏差修正）
python3 research-os/forecast_manager.py calibrate --inject

# 3. 今日重点关注（优先分析的5个标的）
python3 research-os/forecast_manager.py focus

# 4. 宏观数据快照 + Regime 信号检测（FRED）
python3 research-os/fred_agent.py --inject
# 5. 重点标的多视角预判（Investment Committee，5 agents）
python3 research-os/investment_committee.py Gold --inject
python3 research-os/investment_committee.py WTI --inject
```

将以上输出**嵌入分析框架**，不是装饰，而是约束：
- `regime inject` 决定本次信号如何解读（同一数据在不同 regime 下含义不同）
- `calibrate inject` 决定各置信度的可信系数
- `focus` 决定本次分析重点深挖哪些标的
- `auto_score --dry-run` 决定是否需要在本次分析中顺便核查逾期预测

在分析中明确标注：**本次处于 [regime名称] 状态，信号解读如下：...**

---

## Step 1 - 数据收集

```bash
python3 /root/.openclaw/workspace/skills/sellside-news-insight/scripts/collect_news.py
```

输出：
- `FetchNews/reports/news_raw_<timestamp>.md`
- `FetchNews/reports/news_headlines_<timestamp>.md`

优先读 `news_headlines_*.md`，`news_raw_*.md` 用于核实。

## Step 1.5 - Playbook 注入（每次强制执行）

在形成观点前，先做"事件→标的映射"，并读取对应 playbook：

- 地缘/能源冲击：`WTI.md` `Gold.md` `Silver.md` `USD.md` `SPX.md` `UST10Y.md`
- 中国需求冲击：`Copper.md` + 相关商品/股指
- 加密风险事件：`BTC.md` + `USD.md` + `SPX.md`

规则：
1. **若分析涉及某标的，但 `research-os/playbooks/` 下不存在对应文件，立即创建新 playbook（同名 md）再继续分析。**
2. 分析输出里必须出现"来自 playbook 的变量校验结果"（至少 3 条）
3. 每次分析后，把本次"预测对/错的方法"追加到对应 playbook 的"常见错误与修正"（无需 Jasper 审核，直接写入）

## 传导链格式（强制，每条链路必须符合此格式）

每一条二阶/三阶分析链必须写成：

```
事件 → [约束条件] → 中间变量变化 → 资产影响方向 → 时间窗 → 失效条件
```

示例（合格）：
> 霍尔木兹持续封锁 → [伊朗出口减少 200万桶/日，OPEC备用产能约 150万桶/日，缺口无法覆盖] → 近月升水扩大 + 战险费率走高 → WTI短端看涨 → 2-4周 → 若美国协调多国SPR释放超缺口量则失效

示例（不合格，禁止）：
> 中东局势紧张 → 油价上涨 → 市场承压

若传导链未写出约束条件，不允许给出结论。

---

## Step 1.7 - PDF Intel 稳定来源注入（每次强制检查）

读取 `research-os/pdf-intel/index.jsonl` 最近 30 天条目，并按时效加权：
- 0-3 天：高权重（可进入主结论）
- 4-10 天：中权重（辅助验证）
- 11-30 天：低权重（背景/机制）
- >30 天：仅方法论参考，不用于短线方向判断
- 若存在 finance 类 PDF summary：在分析中纳入为"稳定 source"
- 对当天主线相关的 summary，至少引用 1-2 条"可复用机制"
- **Framework-first**：优先提炼并输出"方法框架"（约束、传导链、触发/失效、易错机制），事实数据用于校准当下
- 每次分析后，先更新相关 playbook 的框架条目，再补充事实层注记
- 若当天新闻与 PDF 先验冲突，必须写：冲突点、先验修正条件、失效条件

若用户上传新 PDF：
```bash
python3 research-os/pdf_intel_ingest.py --file <pdf_path>
```
自动分类并生成 summary，再进入当日分析框架。

## Step 2 - 分析输出结构（senior sell-side，Jasper 2026-03-01 确认版）

### 硬规则（不可省略）
- **最少 6 个板块**：新闻速览至少4桶 + 交易机会 + 防御/危险区域
- **主线再强也不能吞掉其他板块**：主线可占40-50%权重，但其他板块必须存在
- **先分桶再提炼**：地缘/美股美债/欧洲外汇/大宗/加密/中国港股/科技AI - 每桶独立出现
- **每板块都要有 Insight**：每条新闻下面有"为什么这对我的仓位重要"，不只是复述事件
- **交易机会必须具体可操作**：工具 + 入场 + 止损 + 催化剂（缺一不可）

---

### 固定输出结构

#### 📌 板块 1-N｜新闻速览（至少 4 板块）
每板块格式：
```
### 📌 板块X｜[主题名]
- [新闻1] *(来源)*
- [新闻2] *(来源)*
...
> **🔍 Insight 1**：[可交易含义]
> **🔍 Insight 2**：[隐藏驱动/风险提示]
```

覆盖优先级（按顺序）：
1. 地缘政治 / 政策风险
2. 美股 + 美债
3. 欧洲 + 外汇 + 周边市场
4. 大宗商品（原油 + 贵金属 + 铜）
5. 加密（BTC/ETH）
6. 中国 + 港股 + A股
7. 科技 / AI（若有重要事件）

---

#### 📊 事件概率看板（Polymarket）
- 3-6 个与当日主线相关的事件
- 当前概率 / 与新闻叙事是否一致
- **Probability insight**：指出赔率与新闻的预期差，哪个方向存在错误定价

---

#### 💼 交易机会（1-4周 / tactical）
每条必须包含：
- **🟢/🟡/🔴 标色**（确定性高低）
- 方向 + 工具（具体ETF/期货/股票）
- 入场条件（具体价位或信号）
- 止损（具体条件，不能只写"止损"）
- 催化剂（触发上行/下行的具体事件）

---

#### 🧭 防御操作（保值优先）
- 推荐防御性配置（短债、现金、黄金、低beta）
- 减持建议：哪些持仓此刻应该减少风险敞口

---

#### ⚠️ 危险区域（主动回避）
- 明确列出不应碰的资产/方向/操作
- 每条给出原因（不是泛泛风险提示）

---

#### 🚀 发展机会（6-24月 / thematic）
- 中长期主线（不用精确价位，但要有逻辑支撑）

---

#### ✅ 总结
- 跨资产偏好排序（一句话，从最看好到最回避）
- 未来 48h 最关键 3 个观察点（编号列出）
- 置信度标注（High/Med/Low，逐条）

#### 🎤 发言总结（晨会口径，固定放在最后）
- 必须输出 **2 段**，用于 Jasper 晨会直接发言。
- **禁止新闻复述**，必须是"新闻推导后的研究结论"。
- 每段建议 120-220 字，聚焦：
  1) 约束条件（政策/库存/资金/波动）
  2) 二阶/三阶传导（资产之间如何联动）
  3) 交易含义（仓位偏向、风险暴露、对冲建议）
- 语气要求：判断清晰、可执行、可被验证；避免口号式表述。

推荐结构：
1. **段落一（框架结论）**：当前最可能宏观-市场状态 + 为什么（关键约束）
2. **段落二（交易落地）**：未来 1-4 周的主交易腿、对冲腿、失效条件

---

## Step 3 - 预测存档（每次分析后强制执行，无需 Jasper 要求）

### 3a. Schema 标准（GS-grade）

所有存档预测必须包含以下字段。**High 置信度预测必须填写 `scenarios` + `strongest_counter`**，否则系统会警告。

```json
{
  "date": "YYYY-MM-DD",
  "source": "daily_news",
  "asset": "Gold",
  "direction": "bullish",
  "horizon": "2w",
  "confidence": "High",
  "stance": "tactical",
  "reasoning": "核心逻辑（50字以内，不要废话）",
  "target": "$3,100",
  "invalidation": "具体失效条件",
  "entry_signal": "触发入场的具体信号",
  "scenarios": {
    "base": {
      "probability": 60,
      "description": "基础情景描述",
      "target": "$3,050",
      "trigger": "触发信号"
    },
    "bull": {
      "probability": 25,
      "description": "牛市情景",
      "target": "$3,300",
      "trigger": "触发信号"
    },
    "bear": {
      "probability": 15,
      "description": "熊市情景",
      "target": "$2,800",
      "trigger": "触发信号"
    }
  },
  "strongest_counter": {
    "counter": "最强反驳观点",
    "response": "你的回应",
    "residual_risk": "接受的剩余风险"
  },
  "actionable": {
    "instrument": "具体工具（期货/ETF/个股）",
    "entry": "入场价/条件",
    "stop": "止损位",
    "size": "仓位建议"
  },
  "status": "open"
}
```

**三情景概率必须相加 = 100%，否则无效。**

### 3b. 每次存档规则

| 情况 | 最少存档条数 |
|------|------------|
| 日常新闻分析 | 3条 |
| 重大事件（战争/政权更迭/央行转向） | 5条以上 |
| X 实时新闻 | 3条（`source: "x_news_realtime"`）|
| Bailian 分析 | 3条（`source: "bailian"`）|

### 3c. 存档命令

```bash
# 写入临时文件后批量导入
python3 research-os/forecast_manager.py add /tmp/fc_today.json

# 导入后立即检查依赖链
python3 research-os/forecast_manager.py dep-check

# 若有需要关联依赖
python3 research-os/forecast_manager.py add-dep <child_id> <parent_id>
```

### 3d. 回复末尾附加存档摘要

```
📌 本次预测存档（N条）
- [id] {asset} {direction} | {horizon} | conf={conf} | 目标:{target}
- [id] {asset} {direction} | {horizon} | conf={conf} | 目标:{target}
Regime: risk_off_war（若本次检测到 regime 变化，标注：⚡ Regime 切换 → 新状态）
```

---

## Step 4 - Regime 检查（每次分析后）

对照 `macro_regime.json` 中的 `exit_conditions`，判断是否需要切换宏观状态：

```bash
python3 research-os/regime_manager.py status
# 若需要切换：
python3 research-os/regime_manager.py switch <regime> --reason "..." --triggers "事件1,事件2"
```

切换标准（满足任一）：
- 当日事件直接触发 exit_condition 中的描述
- 三个以上高置信度预测的 invalidation 条件被触发

---

## Step 5 - 观点变更记录（若本次新闻改变了已有判断）

若新闻使你改变了某条已存档预测的方向或置信度：

```bash
python3 research-os/amend_forecast.py <id> \
  --direction <new_direction> \
  --reason "触发原因" \
  --trigger "具体事件"
```

若失效条件被触发：
```bash
python3 research-os/amend_forecast.py <id> \
  --invalidate \
  --reason "失效条件已触发：xxx"
```

---

## Step 5.5 - 出稿前应用质检（硬闸门，不通过不得出稿）

在发送分析结果前，逐项自检（全部满足才可出稿）：

- [ ] 至少 6 个板块（含交易机会/防御/危险区域）
- [ ] 每个主板块至少 2 条可验证新闻来源
- [ ] 至少 2 条二阶/三阶传导链（事件→约束→资产→反馈）
- [ ] 明确区分"事实"与"推断"（低置信度推断需标注）
- [ ] 已调用对应 playbooks；若缺失标的 playbook，已先创建
- [ ] 每个重点资产给出：方向 + 触发条件 + 失效条件 + 时间窗
- [ ] 至少 3 条结构化 predictions 已存档
- [ ] 给出与历史预测的差异：延续/修正/反转（至少1条）
- [ ] 输出中包含反证路径（最强反驳及回应）

若任意一项不满足：先补数据/补推导，再输出。

## Step 5.8 — 分析输出自动归档到 Info Hub（每次强制执行）

每次新闻分析完成后，必须把最终输出正文写入统一信息源仓库：

```bash
python3 /root/.openclaw/workspace/skills/info-source-hub/scripts/log_daily_news_analysis.py \
  --title "daily_news_$(date +%Y%m%d_%H%M)" \
  --body "<最终分析正文>" \
  --sources "<逗号分隔的source文件路径>"
```

要求：
- `--sources` 至少包含当次主要数据来源（news_headlines / x / pdf summary 任一）
- 归档成功后才视为分析流程闭环完成

## Step 6 — [硬闸门] 分析收尾（每次强制执行）

分析回复发出后，立即执行：

```bash
# 1. 切回 Codex（记录审计日志）
python3 research-os/system_guardrails.py log-switch codex "news_analysis_$(date +%Y%m%d)"

# 2. 冲突检测
python3 research-os/system_guardrails.py conflicts

# 3. 预测质量扫描（确认刚存档的预测质量 ≥ C）
python3 research-os/system_guardrails.py forecast-quality
```

然后执行模型回切（不得跳过）：
`/model openai-codex/gpt-5.3-codex`

---

## Reasoning guardrails

- **Regime-first**：所有信号解读必须先过 regime 框架，同一数据在不同 regime 含义不同
- **Scenario-required**：High 置信度观点必须有三情景，否则不允许标记 High
- **Counter-required**：High 置信度观点必须主动提出最强反驳并回应
- **Facts vs hypotheses**：明确区分事实与推断，推断加"低置信度猜想"标注
- **Freshness first**：优先 24h 内新闻，旧故事压缩或丢弃
- **De-dup required**：同一事件多源出现只保留一条

---

## Trigger phrases

- "分析一下今天新闻"
- "今日新闻复盘"
- "给我 market color"
- "从卖方视角解读新闻"
- "今天发生了什么"
