---
name: "ltv-model-filler"
description: "VV渠道LTV建模：数据过期自动触发浏览器提取→近7日筛选→填充Excel→生成HTML报告（v7.6）"
updated: "2026-06-24"
---

# ltv-model-filler - VV渠道LTV模型填充与HTML报告生成

## 概述

**用途**：从VV总控管理系统自动提取渠道LTV数据和用户质量数据，填充到Excel经营模型，并生成可视化HTML报告。

**版本**：v7.6（数据过期自动触发浏览器提取）
**更新时间**：2026-06-24

## v7.6核心特性

1. **数据过期自动检测**：运行时自动检查数据是否过期（超过1天）
2. **自动触发浏览器提取**：数据过期时返回特定退出码，Agent 自动执行浏览器提取流程
3. **近7日智能筛选**：以数据中最新日期为准，自动取近7天

## Agent 执行流程

```
【执行入口】

用户请求 → Agent 执行以下步骤：

1. 运行检查脚本
   node scripts/run-ltv-model.mjs
   
   ├─ 返回码 0 → 数据新鲜，继续处理
   ├─ 返回码 10 → 数据过期，执行浏览器提取
   └─ 返回码 1 → 其他错误，报告问题

2. 如果返回码 10（数据过期），执行浏览器提取：
   
   【步骤 2.1】启动浏览器
   browser: action=start, profile=user
   
   【步骤 2.2】导航到产品数据页面
   browser: action=navigate, url=https://allcmsweb-pro.vvyyds.com/#/dataCenter/productData
   
   【步骤 2.3】等待页面加载，拍摄快照
   browser: action=snapshot
   - 检查是否需要登录
   - 检查是否有二级密码弹窗（如有则输入密码）
   
   【步骤 2.4】点击 vv 按钮
   browser: action=act, kind=click, selector=button:has-text("vv")
   或通过快照 ref 点击
   
   【步骤 2.5】等待数据加载
   browser: action=act, kind=wait, timeMs=2000
   
   【步骤 2.6】点击"新增"标签
   browser: action=act, kind=click, selector=h3:has-text("新增")
   或通过快照 ref 点击
   
   【步骤 2.7】等待表格加载
   browser: action=act, kind=wait, timeMs=3000
   
   【步骤 2.8】提取数据
   browser: action=act, kind=evaluate
   fn: 提取脚本
   
   提取脚本内容：
   (() => {
     const tables = document.querySelectorAll('.el-table');
     const result = { ltvData: [], qualityData: [] };
     
     // 渠道LTV表格（第二个表格）
     const table1 = tables[1];
     if (table1) {
       const rows = Array.from(table1.querySelectorAll('.el-table__body tr'));
       result.ltvData = rows.map(tr => {
         const tds = tr.querySelectorAll('td');
         return {
           date: tds[0]?.textContent.trim() || '',
           newUsers: parseInt(tds[1]?.textContent.replace(/[^0-9]/g, '')) || 0,
           ltv1: parseFloat(tds[2]?.textContent.replace(/[^0-9.]/g, '')) || 0,
           ltv3: parseFloat(tds[3]?.textContent.replace(/[^0-9.]/g, '')) || 0,
           ltv7: parseFloat(tds[4]?.textContent.replace(/[^0-9.]/g, '')) || 0,
           ltv15: parseFloat(tds[5]?.textContent.replace(/[^0-9.]/g, '')) || 0,
           ltv30: parseFloat(tds[6]?.textContent.replace(/[^0-9.]/g, '')) || 0,
           ltv60: parseFloat(tds[7]?.textContent.replace(/[^0-9.]/g, '')) || 0
         };
       }).filter(r => r.date && r.newUsers > 0);
     }
     
     // 用户质量表格（第三个表格）
     const table2 = tables[2];
     if (table2) {
       const rows = Array.from(table2.querySelectorAll('.el-table__body tr'));
       result.qualityData = rows.map(tr => {
         const tds = tr.querySelectorAll('td');
         return {
           date: tds[0]?.textContent.trim() || '',
           channel: '全部',
           newUsers: parseInt(tds[1]?.textContent.replace(/[^0-9]/g, '')) || 0,
           payRateD0: parseFloat(tds[2]?.textContent.replace(/[^0-9.]/g, '')) || 0,
           payAmountD0: parseFloat(tds[3]?.textContent.replace(/[^0-9.]/g, '')) || 0,
           payAmountD7: parseFloat(tds[4]?.textContent.replace(/[^0-9.]/g, '')) || 0
         };
       }).filter(r => r.date && r.newUsers > 0);
     }
     
     return result;
   })()
   
   【步骤 2.9】保存数据到 raw_data.json
   将提取结果写入：<技能目录>/raw_data.json
   格式：
   {
     "meta": {
       "extractedAt": "<ISO时间>",
       "method": "browser-tool"
     },
     "ltvData": [...],
     "qualityData": [...]
   }
   
   【步骤 2.10】关闭浏览器
   browser: action=stop

3. 重新运行处理流程
   node scripts/run-ltv-model.mjs
   
   - 数据转换（自动筛选近7日）
   - Excel填充（可选）
   - LTV分析
   - 生成HTML报告

4. 返回结果
   - 输出文件路径
   - 关键指标摘要
```

## 手动运行选项

```bash
node scripts/run-ltv-model.mjs               # 完整流程
node scripts/run-ltv-model.mjs --skip-fill   # 跳过Excel填充
node scripts/run-ltv-model.mjs --only-report # 仅生成HTML报告
node scripts/run-ltv-model.mjs --force       # 强制使用过期数据
```

## 返回码定义

| 返回码 | 含义 |
|--------|------|
| 0 | 成功完成 |
| 10 | 数据过期，需要浏览器提取 |
| 1 | 其他错误 |

## 数据来源

### 1. 新增用户数和LTV数据
- **页面路径**：产品数据 → vv → 新增
- **DOM定位**：`.el-table` 索引1
- **提取字段**：日期、新增用户数、1/3/7/15/30/60日LTV

### 2. 付费金额和付费率数据
- **页面路径**：产品数据 → vv → 新增
- **DOM定位**：`.el-table` 索引2
- **提取字段**：日期、付费率D0、付费D0、付费D7

## 近7日数据筛选逻辑

```javascript
const allDates = raw.ltvData.map(d => d.date).sort().reverse();
const latestDate = allDates[0];
const latestDateObj = new Date(latestDate);

const recent7Days = [];
for (let i = 0; i < 7; i++) {
  const date = new Date(latestDateObj);
  date.setDate(date.getDate() - i);
  recent7Days.push(date.toISOString().split('T')[0]);
}

raw.ltvData.filter(d => recent7Days.includes(d.date));
```

## 脚本文件

| 脚本 | 用途 |
|------|------|
| `run-ltv-model.mjs` | 主入口脚本（含数据新鲜度检查） |
| `transform-data.mjs` | 数据格式转换 + 近7日筛选 |
| `fill-model.mjs` | Excel填充 |
| `analyze-ltv.mjs` | LTV分析计算 |
| `gen-report.mjs` | 生成HTML报告 |

## 输出文件

- `游戏LTV经营模型.xlsx` - Excel经营模型
- `report.html` - 可视化HTML报告
- `raw_data.json` - 原始提取数据
- `input_data.json` - 转换后数据（近7日）
- `results.json` - 分析结果

## HTML报告结构

- **数据概览**：关键指标汇总、逐批次明细
- **LTV分解**：三因子瀑布图、贡献分析表
- **诊断→行动**：自动生成运营方案
- **6周甘特图**：实施排期可视化
- **KPI看板**：基线与逐周跟踪

## 依赖

- `browser` 工具（OpenClaw核心）
- `browser-automation` 技能
- `exceljs` 包（Excel操作）
- VV总控管理系统账号

---

**版本**：v7.6
**依赖技能**：browser-automation
