name: daily-vv-diagnosis-automation
description: |
  VV渠道每日经营体检自动化 - 同时运行 5 个诊断技能并交付报告。
  触发场景：每日定时任务 / 用户一次性要求 "跑一次体检"。

metadata:
  trigger:
    - "每日 10:00 自动运行"
    - "运行体检"
    - "跑一次全量诊断"
    - "运行所有 skill"
  skills:
    - revenue-diagnosis
    - retention-diagnosis
    - platform-diagnosis
    - ltv-model-filler
    - vv-active-decomposition
  inputs_required:
    - raw_data.json (revenue-diagnosis)
    - raw_data.json (retention-diagnosis)
    - platform_raw.json (platform-diagnosis)
    - raw_data.json (ltv-model-filler)
    - raw_data.json (vv-active-decomposition)
  outputs:
    - 5x HTML 报告
    - 5x results.json
    - 1x cross_diagnosis.json
    - 1x 摘要消息 (markdown 格式)

version: 1.0
tested_on: 2026-06-24
workspace: C:\Users\1\WorkBuddy\automation-2026-06-24-09-16-05
skill_base: C:\Users\1\.workbuddy\skills

# 每日 VV 渠道经营体检 — 自动化运行

## 概述

5 个诊断技能在每日 10:00 自动化运行。共同目标：诊断 VV 渠道在"营收 / 留存 / 平台 / LTV / 活跃"5 个维度的健康度。

## 工作流

```
1. 加载 5 个技能
2. 验证 raw_data.json 是否存在
3. 并行运行所有主入口脚本
4. 收集结果并撰写执行摘要
5. 交付 HTML 报告 + results.json
```

## 执行命令模板

**Node 运行（隔离）**：
- 必须使用绝对路径 `C:\Users\1\.workbuddy\binaries\node\versions\22.22.2\node.exe`
- 必须设置 `NODE_PATH=C:\Users\1\.workbuddy\binaries\node\workspace\node_modules`
- 依赖安装：`npm.cmd install <pkg>` 到 `C:\Users\1\.workbuddy\binaries\node\workspace`

**5 个主入口**：
```bash
# 1. revenue-diagnosis
cd "C:\Users\1\.workbuddy\skills\revenue-diagnosis"
node scripts/run-diagnosis.mjs

# 2. retention-diagnosis
cd "C:\Users\1\.workbuddy\skills\retention-diagnosis"
node scripts/run-retention-diagnosis.mjs --skip-filter

# 3. platform-diagnosis
cd "C:\Users\1\.workbuddy\skills\platform-diagnosis"
node scripts/run-platform-diagnosis.mjs

# 4. ltv-model-filler
cd "C:\Users\1\.workbuddy\skills\ltv-model-filler"
node scripts/run-ltv-model.mjs --skip-fill

# 5. vv-active-decomposition
cd "C:\Users\1\.workbuddy\skills\vv-active-decomposition"
node scripts/run-decomposition-html.mjs   # 注意是 HTML 版
```

## 注意事项

1. **vv-active-decomposition** 有两个脚本：
   - `run-decomposition.mjs` — 仅生成 JSON
   - `run-decomposition-html.mjs` — 生成 HTML 报告（自动化首选）
2. **Browser Tool 不可用**：如果 raw_data 不存在，必须先运行 `extract-*-browser.mjs` 提取数据（需要 Browser Tool/connector 接入）。当前环境无 Browser Tool，需手动准备 raw_data。
3. **Excel 模型**：`ltv-model-filler` 默认会尝试填充 `游戏LTV经营模型.xlsx`，自动化场景用 `--skip-fill` 跳过。
4. **retention-diagnosis** 数据 >7 天会自动筛选近 7 日；自动化场景用 `--skip-filter` 保留所有。

## 报告输出路径

```
skills/revenue-diagnosis/report/index.html
skills/retention-diagnosis/report.html
skills/platform-diagnosis/report/index.html
skills/ltv-model-filler/report.html
skills/vv-active-decomposition/report/index.html
```

## 摘要格式

执行完成后输出 markdown 摘要，包含：
- 数据期间
- 5 项关键结论（每技能一行）
- 核心洞察 (跨技能关联)
- 报告路径

## 摘要示例（2026-06-24）

- **revenue**: 营收 -¥947,340（-68.4%），主因用户量效应73.7%；CR3=5.11%, HHI=12.73 健康
- **retention**: 活跃留存 -2.4pt，主因结构稀释
- **platform**: 健康分 75/100，HHI=6932 极高，主诊断"拉新质量塌陷"
- **ltv**: 平均LTV_D0=¥32.73，回本1.15×；LTV_D0断崖式下跌-63.69%
- **active**: 总时长 -9.59%；规模效应150.5%（进房人数-14.09%）
