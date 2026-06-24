---
name: "retention-diagnosis"
description: "VV渠道留存诊断：数据过期自动触发浏览器提取→LMDI-I分解→甘特图→KPI看板（v4.3.1，修复报告生成bug）"
updated: "2026-06-24"
---

# retention-diagnosis - VV渠道用户留存诊断

## 概述

**用途**：对VV渠道用户留存数据进行全面诊断，包括留存三因素分解、数据质量检查、8周甘特图和KPI看板。

**版本**：v4.3.1（修复报告生成脚本数据格式兼容性问题）
**更新时间**：2026-06-24

## v4.3.1 更新内容

### Bug 修复

修复 `generate-report.mjs` 数据格式兼容性问题：
- 脚本期望数组格式，但 `raw_data.json` 使用 `{ meta, days }` 结构
- 修复：`const data = parsed.days || parsed;` 支持两种格式

### v4.3 功能

1. **数据过期自动检测**：运行时自动检查数据是否过期（超过1天）
2. **自动触发浏览器提取**：数据过期时返回退出码 10，Agent 自动执行浏览器提取
3. **返回码定义**：
   - `0` → 成功完成
   - `10` → 数据过期，需要浏览器提取
   - `1` → 其他错误

## Agent 执行流程

```
用户请求 → Agent 执行以下步骤：

1. 运行检查脚本
   node scripts/run-retention-diagnosis.mjs
   
   ├─ 返回码 0 → 数据新鲜，继续处理
   ├─ 返回码 10 → 数据过期，执行浏览器提取
   └─ 返回码 1 → 其他错误，报告问题

2. 如果返回码 10（数据过期），执行浏览器提取：

   【步骤 2.1】启动浏览器
   browser: action=start, profile=openclaw
   
   【步骤 2.2】导航到产品数据页面
   browser: action=navigate, url=https://allcmsweb-pro.vvyyds.com/#/dataCenter/productData
   
   【步骤 2.3】等待加载，检查页面状态
   browser: action=snapshot
   - 检查是否需要登录
   - 检查是否有二级密码弹窗（如有则输入密码：Qizige121）
   
   【步骤 2.4】点击 vv 按钮
   browser: action=snapshot → 找到 vv 按钮
   browser: action=act, kind=click, ref=<vv按钮ref>
   
   【步骤 2.5】等待数据加载
   browser: action=act, kind=wait, timeMs=2000
   
   【步骤 2.6】点击"留存"卡片
   browser: action=snapshot → 找到留存卡片（h3:contains("留存")）
   browser: action=act, kind=click, ref=<留存卡片ref>
   
   【步骤 2.7】等待表格加载
   browser: action=act, kind=wait, timeMs=3000
   
   【步骤 2.8】提取留存数据（从页面快照）
   browser: action=snapshot
   
   从快照中提取：
   - 新用户留存表格：日期、新增、1天留存%、3天留存%...
   - 老用户留存表格：日期、新增、1天留存%...
   - 活跃用户留存表格：日期、活跃、1天留存%...
   
   【步骤 2.9】保存数据到 raw_data.json
   将提取结果写入：<技能目录>/raw_data.json
   格式：
   ```json
   {
     "meta": { 
       "extractedAt": "<ISO时间>", 
       "method": "browser-tool",
       "status": "success"
     },
     "days": [
       {"date": "2026-06-23", "newUsers": 1592, "oldUsers": 14335, "newRetain1": 33.03, "oldRetain1": 71.69}
     ]
   }
   ```
   
   【步骤 2.10】关闭浏览器
   browser: action=stop

3. 重新运行诊断
   node scripts/run-retention-diagnosis.mjs

4. 返回结果
   - 输出文件路径
   - 关键诊断指标
```

## 数据提取说明

由于页面使用动态渲染，数据提取需从浏览器快照中解析：

**新用户留存表格结构**（从快照示例）：
```
row "2026-06-23 1592 0% 0% 0% 0% 0% 0% 0% 0% 0%"
  - cell "2026-06-23" → date
  - cell "1592" → newUsers
  - cell "0%" → newRetain1 (第1天留存)
row "2026-06-22 1408 33.03% 0% 0% 0% 0% 0% 0% 0% 0%"
  - cell "33.03%" → newRetain1
```

**老用户留存表格结构**：
```
row "2026-06-23 14335 0% 0% 0% 0% 0% 0% 0% 0% 0%"
  - cell "14335" → oldUsers
  - cell "0%" → oldRetain1
```

**注意**：当日数据的留存为0%（因为还没有到第二天），提取时需过滤或标记。

## 手动运行选项

```bash
node scripts/run-retention-diagnosis.mjs               # 完整流程
node scripts/run-retention-diagnosis.mjs --skip-filter # 跳过数据筛选
node scripts/run-retention-diagnosis.mjs --force       # 强制使用过期数据
node scripts/run-retention-diagnosis.mjs --verbose     # 详细输出
```

## 留存三因素分解

```
Δ活跃留存 = 结构效应 + 新留存效应 + 老留存效应

结构效应 = (新用户占比变化) × (新老留存差)
新留存效应 = (平均新用户占比) × (新留存变化)
老留存效应 = (平均老用户占比) × (老留存变化)
```

## 主导因素判断

| 主导因素 | 症状 | 行动方向 |
|----------|------|----------|
| **结构稀释** | 新用户占比上升，活跃留存下降 | 控制获客节奏，设置渠道留存门槛 |
| **新留存恶化** | 新用户留存下降 | 优化onboarding，检查渠道质量 |
| **老留存恶化** | 老用户留存下降 | 流失预警，召回策略 |

## 脚本文件

| 脚本 | 用途 |
|------|------|
| `run-retention-diagnosis.mjs` | **主入口脚本**（含新鲜度检查） |
| `extract-retention-browser.mjs` | 浏览器数据提取 |
| `filter-recent-days.mjs` | 数据筛选（近7日） |
| `run-diagnosis.mjs` | 留存诊断分解 |
| `generate-report.mjs` | 生成HTML报告 |

## 输出文件

- `raw_data.json` — 原始数据（{ meta, days } 格式）
- `results.json` — 分解结果
- `report.html` — HTML诊断报告

## 数据格式

```json
{
  "meta": { 
    "extractedAt": "2026-06-24T10:00:00.000Z", 
    "method": "browser-tool",
    "status": "success"
  },
  "days": [
    {
      "date": "2026-06-23", 
      "newUsers": 1592, 
      "oldUsers": 14335, 
      "newRetain1": 33.03, 
      "oldRetain1": 71.69
    }
  ]
}
```

---

**版本**：v4.3.1
**关键改进**：修复报告生成脚本数据格式兼容性问题
