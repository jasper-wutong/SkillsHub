# 雨课堂接口参考

## 关键 URL 模式

### 课程结构（获取视频/作业列表）
```
GET /v2/api/web/logs/learn/<classroom_id>?actype=-1&page=0&offset=50&sort=-1
```
- type=17: 视频；type=19: 作业
- 分页用 prev_id 参数
- 按 activity.id 升序 = 发布顺序

### 视频播放页（PC 端）
```
https://pro.yuketang.cn/bindmobile/video-student-unit/<classroom_id>/<leaf_id>
```

### 作业封面页（移动端 UA 必须）
```
https://pro.yuketang.cn/bindmobile/cloud/exercise/cover/<classroom_id>/<leaf_id>/<sku_id>
```

### 视频心跳
```
POST /video-log/log/track/
```
浏览器自动发送，无需手动调用。

### leaf_info（获取视频时长等信息）
```
GET /mooc-api/v1/lms/learn/leaf_info/<classroom_id>/<leaf_id>/
```

### 作业题目列表 API
```
GET /mooc-api/v1/lms/exercise/get_exercise_list/<leaf_type_id>/<sku_id>/?term=latest&uv_id=<uv_id>
```
⚠️ 返回的题目文字使用 `xuetangx-com-encrypted-font` 字体加密，直接读取是乱码。
**必须通过浏览器渲染截图来获取题目内容。**

## Cookie 管理

- Cookie 文件格式：Playwright JSON 数组（`context.addCookies()`）
- 存放路径约定：`artifacts/yuketang/manual-cookies-full.json`
- 获取方式：手动登录浏览器后导出（editthiscookie 或 playwright context.storageState）

## 关键 IDs

| 字段 | 含义 |
|------|------|
| classroom_id | 课堂 ID（URL 中的数字，如 3179486）|
| leaf_id | 单个内容节点 ID（视频或作业） |
| sku_id | 课程购买版本 ID（通常固定，如 893998）|
| leaf_type_id | 作业题库 ID（在 activity.content.leaf_type_id）|

## 作业提交机制

雨课堂作业是**逐题提交制**（非整份提交）：
1. 选择答案 → 2. 点"提交"按钮 → 3. 点弹窗确认"提交" → 进入下一题
4. 答题卡进度 N/Total 实时更新
5. 全部提交后底部按钮变灰色"已提交"

## User-Agent 要求

- **作业页**：必须用移动端 UA（iPhone），否则题目不渲染
  ```
  Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1
  ```
- **课程目录/视频页**：PC UA 即可

## 已知坑

1. **字体加密**：题目文字是乱码，只能截图读取
2. **networkidle 超时**：某些页面永远不达到 networkidle，用 domcontentloaded + sleep 代替
3. **className.includes 报错**：SVG 元素的 className 是 SVGAnimatedString，需 `String(el.className || '')`
4. **el-radio 点击**：必须点 `.el-radio__inner` 圆圈坐标，不能用文字匹配（文字也是加密的）
5. **翻页**：找 class 含 `arrow-right` 的元素并 click()，不要用 `>` 文字匹配
