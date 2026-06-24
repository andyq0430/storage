---
name: "vv-active-decomposition"
description: "VV渠道活跃度LMDI-I分解：数据过期自动触发浏览器提取→规模与强度效应（v5.3，数据新鲜度检查）"
updated: "2026-06-24"
---

# vv-active-decomposition - VV渠道活跃度LMDI-I分解

## 概述

**用途**：从产品数据页面提取VV渠道活跃数据，运行LMDI-I分解模型分析总使用时长环比变化的贡献因素。

**版本**：v5.3（数据新鲜度检查 + 自动浏览器提取）

## v5.3 更新内容

### 核心改进

1. **数据过期自动检测**：运行时自动检查数据是否过期（超过1天）
2. **自动触发浏览器提取**：数据过期时返回退出码 10，Agent 自动执行浏览器提取
3. **返回码定义**：
   - `0` → 成功完成
   - `10` → 数据过期，需要浏览器提取
   - `1` → 其他错误
4. **新增 `--force` 参数**：跳过新鲜度检查，强制使用过期数据

### 数据新鲜度检查逻辑

检查 `raw_data.json` 中 `banKuaiData` 数组最新日期。

**重要**：检查的是业务日期，不是提取时间。

## Agent 执行流程

```
用户请求 → Agent 执行以下步骤：

1. 运行检查脚本
   node scripts/run-decomposition-html.mjs
   
   ├─ 返回码 0 → 数据新鲜，继续处理
   ├─ 返回码 10 → 数据过期，执行浏览器提取
   └─ 返回码 1 → 其他错误，报告问题

2. 如果返回码 10（数据过期），执行浏览器提取：

   【步骤 2.1】启动浏览器
   browser: action=start, profile=openclaw
   
   【步骤 2.2】导航到产品数据页面
   browser: action=navigate, url=https://allcmsweb-pro.vvyyds.com/#/dataCenter/productData
   
   【步骤 2.3】等待加载，检查页面状态
   
   【步骤 2.4】点击 vv 按钮
   
   【步骤 2.5】等待数据加载
   
   【步骤 2.6】点击活跃卡片
   
   【步骤 2.7】等待表格加载
   
   【步骤 2.8】提取板块活跃数据
   
   【步骤 2.9】保存数据到 raw_data.json
   
   【步骤 2.10】关闭浏览器

3. 重新运行诊断
   node scripts/run-decomposition-html.mjs

4. 返回结果
```

## LMDI-I分解

```
ΔT = 规模效应 + 强度效应

规模效应 = L × ln(J₁/J₀)  （进房人数变化）
强度效应 = L × ln(S₁/S₀)  （人均时长变化）
```

## 输出文件

- `raw_data.json` — 原始数据
- `vv_active_decomposition_results.json` — 分解结果
- `report/index.html` — HTML诊断报告

---

**版本**：v5.3
**关键改进**：数据新鲜度检查 + 自动浏览器提取
