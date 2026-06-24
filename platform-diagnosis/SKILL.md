---
name: "platform-diagnosis"
description: "平台经营体检：数据过期自动触发浏览器提取→四维交叉诊断→健康分→行动计划（v2.4，数据新鲜度检查）"
updated: "2026-06-24"
---

# platform-diagnosis - 平台总体经营体检

## 概述

**用途**：分析平台整体经营数据（不限定VV渠道），包含新增·LTV、活跃、营收、留存四个维度的交叉诊断。

**版本**：v2.4（数据过期自动触发浏览器提取）
**更新时间**：2026-06-24

## v2.4更新内容

### 核心改进

1. **数据过期自动检测**：运行时自动检查数据是否过期（超过1天）
2. **自动触发浏览器提取**：数据过期时返回退出码 10，Agent 自动执行浏览器提取
3. **返回码定义**：
   - `0` → 成功完成
   - `10` → 数据过期，需要浏览器提取
   - `1` → 其他错误

### Agent 执行流程

```
用户请求 → Agent 执行以下步骤：

1. 运行检查脚本
   node scripts/run-platform-diagnosis.mjs
   
   ├─ 返回码 0 → 数据新鲜，继续处理
   ├─ 返回码 10 → 数据过期，执行浏览器提取
   └─ 返回码 1 → 其他错误，报告问题

2. 如果返回码 10（数据过期），执行浏览器提取：

   【步骤 2.1】启动浏览器
   browser: action=start
   
   【步骤 2.2】导航到产品数据页面
   browser: action=navigate, url=https://allcmsweb-pro.vvyyds.com/#/dataCenter/productData
   
   【步骤 2.3】等待加载，检查页面状态
   browser: action=snapshot
   - 检查是否需要登录
   - 检查是否有二级密码弹窗（如有则输入密码）
   
   【步骤 2.4】确保"全平台"按钮选中
   browser: action=act, kind=click, selector=button:has-text("全平台")
   
   【步骤 2.5】等待数据加载
   browser: action=act, kind=wait, timeMs=2000
   
   【步骤 2.6】提取四维数据
   browser: action=act, kind=evaluate
   fn: 提取脚本（见 SKILL.md）
   
   【步骤 2.7】保存数据到 platform_raw.json
   
   【步骤 2.8】关闭浏览器
   browser: action=stop

3. 重新运行诊断
   node scripts/run-platform-diagnosis.mjs

4. 返回结果
   - 输出文件路径
   - 健康分和关键诊断
```

## 手动运行选项

```bash
node scripts/run-platform-diagnosis.mjs               # 完整流程
node scripts/run-platform-diagnosis.mjs --skip-diag   # 仅生成报告
node scripts/run-platform-diagnosis.mjs --force       # 强制使用过期数据
node scripts/run-platform-diagnosis.mjs --verbose    # 详细输出
```

## 诊断规则（13条）

| ID | 规则名 | 风险 | 假设 |
|----|--------|------|------|
| 1 | 拉新质量塌陷 | 高 | 新增↑ 留存↓ |
| 2 | 获量规模下滑 | 高 | 新增↓ 活跃↓ |
| 3 | 活跃度塌方 | 高 | 活跃↓ 营收↓ |
| 4 | 鲸鱼依赖加剧 | 极高 | 活跃↓ 营收↑ 基尼≥0.6 |
| 5 | 付费转化下滑 | 高 | 营收↓ 付费率↓ |
| 6 | 存量用户流失 | 高 | 留存↓ 老留存主导 |
| 7 | 新留存拖累 | 中 | 留存↓ 新留存主导 |
| 8 | ARPPU提升对冲 | 中 | 付费用户↓ 营收→ |
| 9 | 规模扩张正常 | 低 | 四维全↑ |
| 10 | 营收下滑但用户稳 | 高 | 营收↓ 活跃→ |
| 11 | 全盘性下滑 | 极高 | 四维全↓ |
| 12 | 全维增长 | 低 | 四维全↑ |
| 13 | 稳中向好 | 低 | 营收↑ 其他稳定 |

## 脚本文件

| 脚本 | 用途 |
|------|------|
| `run-platform-diagnosis.mjs` | **主入口脚本**（含新鲜度检查） |
| `extract-platform-browser.mjs` | 浏览器数据提取 |
| `cross-diagnosis.mjs` | 四维交叉诊断引擎 |
| `generate-report.mjs` | 生成HTML报告 |

## 输出文件

- `platform_raw.json` — 四维原始数据（含各平台详情）
- `cross_diagnosis.json` — 交叉诊断结果
- `report/index.html` — 平台经营体检报告（7标签页）

---

**版本**：v2.4
**依赖技能**：browser-automation
