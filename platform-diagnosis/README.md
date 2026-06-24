# platform-diagnosis 技能创建说明

## 技能概述

**名称**：platform-diagnosis（平台总体经营体检）

**用途**：分析平台整体经营数据（不限定VV渠道），包含新增·LTV、活跃、营收、留存四个维度的交叉诊断。

## 与 vv-platform-diagnosis 的区别

| 特性 | vv-platform-diagnosis | platform-diagnosis |
|------|----------------------|-------------------|
| 数据范围 | VV渠道特定数据 | 平台总体数据（全渠道聚合） |
| 页面入口 | 产品数据 → vv按钮 | 产品数据（直接查看汇总） |
| 适用场景 | 渠道级诊断 | 平台级/整体经营诊断 |

## 核心能力

1. **四维数据提取**：一次性提取新增、活跃、营收、留存数据
2. **交叉诊断引擎**：13条规则矩阵，识别结构性问题
3. **统一健康分**：四维加权评分（0-100）
4. **根因回溯**：沿漏斗回溯到最上游可解释维度
5. **整合行动计划**：去重、排序、排期

## 文件结构

```
skills/platform-diagnosis/
├── SKILL.md                      # 技能文档
├── scripts/
│   ├── cross-diagnosis.mjs       # 交叉诊断引擎（核心）
│   ├── extract-platform-data.mjs # 数据提取脚本
│   └── generate-report.mjs       # HTML报告生成（待创建）
├── platform_raw.json             # 原始数据（示例）
├── cross_diagnosis.json          # 诊断结果
└── results.json                  # 健康分 + 行动计划
```

## 使用方法

```bash
# 提取平台数据
node skills/platform-diagnosis/scripts/extract-platform-data.mjs 7

# 运行交叉诊断
node skills/platform-diagnosis/scripts/cross-diagnosis.mjs platform_raw.json

# 生成报告（待实现）
node skills/platform-diagnosis/scripts/generate-report.mjs
```

## 诊断规则示例

根据示例数据（新增↑18%，留存↓8%，活跃↓9.6%，营收↑2%），可能命中：

- **规则1**：新增↑ & 留存↓ → 拉新质量塌陷（高风险）
- **规则4**：活跃↓ & 营收→/↑ & 基尼≥0.6 → 鲸鱼依赖加剧（极高风险）
- **规则10**：活跃主导=规模效应↓ & 新增稳 → 老用户唤回不足（中风险）

## 健康分计算

示例健康分约 55-65 分（预警级别）：
- 营收：62分（方向↑，基尼风险）
- 留存：48分（方向↓，老留存主导）
- 活跃：55分（方向↓，规模效应）
- 新增：70分（方向↑，但质量下滑）

## 待实现功能

1. **generate-report.mjs**：生成HTML报告（6标签页）
2. **LMDI分解**：活跃/营收的主导因素精确计算
3. **基尼系数计算**：从分档数据精确计算
4. **行动计划甘特图**：8周排期可视化

## 技术要点

1. 数据来源为平台汇总（非单渠道）
2. 交叉诊断依赖各维"主导因素"字段
3. LMDI为描述性归因，非因果推断
4. 日期对齐需取四维都有效的交集