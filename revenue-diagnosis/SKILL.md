---
name: "revenue-diagnosis"
description: "VV渠道营收体检：数据过期自动触发浏览器提取→LMDI三因子分解→集中度分析→HTML报告（v3.3，数据新鲜度检查）"
updated: "2026-06-24"
---

# revenue-diagnosis - VV渠道营收体检

## 概述

**用途**：对VV渠道营收数据进行全面诊断，包括LMDI三因子分解、集中度分析和TOP频道分布。

**版本**：v3.3（数据过期自动触发浏览器提取）
**更新时间**：2026-06-24

## v3.3 更新内容

### 核心改进

1. **数据过期自动检测**：运行时自动检查数据是否过期（超过1天）
2. **自动触发浏览器提取**：数据过期时返回退出码 10，Agent 自动执行浏览器提取
3. **返回码定义**：
   - `0` → 成功完成
   - `10` → 数据过期，需要浏览器提取
   - `1` → 其他错误
4. **新增 `--force` 参数**：跳过新鲜度检查，强制使用过期数据

### v3.2 功能保留

- **集中度计算修复**：`tiers` 为空时自动切换到 TOP频道数据计算 CR3/CR10/HHI

## Agent 执行流程

```
用户请求 → Agent 执行以下步骤：

1. 运行检查脚本
   node scripts/run-diagnosis.mjs
   
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
   
   【步骤 2.6】获取页面快照（包含基础营收表格 + TOP频道表格）
   browser: action=snapshot
   
   【步骤 2.7】从快照提取数据
   
   **基础营收表格**（日期、营收、付费用户数、付费渗透率、ARPPU）：
   ```
   row "2026-06-24 297091元 301618.27元 325511.43元 2488.4元 1542 29 18.86% 16.2% 195.6 85.81 329 492"
     - cell "2026-06-24" → date
     - cell "1330566.12元" → totR（营收总额，需去除"元"）
     - cell "3961" → totPU（付费用户数）
     - cell "24.98%" → totp（付费渗透率）
     - cell "13.38%" → newp（新用户渗透率）
     - cell "335.92" → arppu
   ```
   
   **TOP频道营收表格**：
   ```
   row "2026-06-22 1 AU501739 全部 409177 声恋传媒 ... 147607.1元 ... 1.95%"
     - cell "AU501739" → channelId
     - cell "147607.1元" → revenue
     - cell "1.95%" → share
   ```
   
   【步骤 2.8】保存数据到 raw_data.json
   格式：
   ```json
   {
     "meta": {
       "extractedAt": "<ISO时间>",
       "method": "browser-tool",
       "status": "success"
     },
     "days": [
       {"date": "2026-06-23", "totR": 1330566.12, "totPU": 3961, "totp": 24.98, "newp": 13.38, "arppu": 335.92, "recharge": 1352965.8}
     ],
     "top": [
       {"channelId": "AU501739", "revenue": 147607.1, "share": 1.95}
     ],
     "tiers": []
   }
   ```
   
   【步骤 2.9】关闭浏览器
   browser: action=stop

3. 重新运行诊断
   node scripts/run-diagnosis.mjs

4. 返回结果
   - 输出文件路径
   - 关键诊断指标
```

## 手动运行选项

```bash
node scripts/run-diagnosis.mjs              # 正常流程（检查新鲜度）
node scripts/run-diagnosis.mjs --force      # 强制使用过期数据
node scripts/run-diagnosis.mjs --verbose    # 详细输出
```

## LMDI三因子分解

```
Δ营收 = 用户量效应 + 渗透率效应 + ARPPU效应

用户量效应 = L × ln(U1/U0)
渗透率效应 = L × ln(p1/p0)  
ARPPU效应 = L × ln(ARPPU1/ARPPU0)

其中 L = (R1-R0) / ln(R1/R0)（对数平均）
```

## 集中度分析

### 方案A：基尼系数（需付费分档数据）

| 指标 | 健康阈值 |
|------|---------|
| 基尼系数 | < 0.45（较广基） |

### 方案B：CR3/CR10/HHI（TOP频道 fallback）

| 指标 | 公式 | 偨康阈值 |
|------|------|---------|
| CR3 | TOP3营收占比 | < 10% |
| CR10 | TOP10营收占比 | < 20% |
| HHI | Σ(份额²)×10000 | < 100（竞争充分） |

**HHI判断标准**：
- HHI < 100：竞争充分（健康）
- HHI 100-1500：适度集中（需关注）
- HHI > 1500：高度集中（依赖风险）

## 数据新鲜度检查逻辑

检查 `raw_data.json` 中 `days` 数组最新日期：

```javascript
const dates = days.map(d => d.date).sort().reverse();
const maxDate = dates[0];  // 最新业务日期
const diffDays = (today - maxDateObj) / (1000*60*60*24);
const isFresh = diffDays <= 1;  // 超过1天视为过期
```

**重要**：检查的是业务日期（如 2026-06-23），不是提取时间（meta.extractedAt）。

## 脚本文件

| 脚本 | 用途 |
|------|------|
| `run-diagnosis.mjs` | **主入口脚本**（含新鲜度检查） |
| `extract-revenue-browser.mjs` | 浏览器数据提取参考 |
| `filter-recent-days.mjs` | 数据筛选 |

## 输出文件

- `raw_data.json` — 原始数据
- `results.json` — 分解结果
- `report/index.html` — HTML诊断报告

## 数据格式

```json
{
  "meta": {
    "extractedAt": "2026-06-24T11:00:00.000Z",
    "method": "browser-tool",
    "status": "success"
  },
  "days": [
    {"date": "2026-06-23", "totR": 1330566.12, "totPU": 3961, "totp": 24.98, "newp": 13.38, "arppu": 335.92, "recharge": 1352965.8}
  ],
  "top": [
    {"channelId": "AU501739", "revenue": 147607.1, "share": 1.95}
  ],
  "tiers": []
}
```

---

**版本**：v3.3
**关键改进**：数据新鲜度检查 + 自动浏览器提取
