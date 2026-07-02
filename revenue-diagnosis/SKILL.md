---
name: "revenue-diagnosis"
description: "VV营收体检：数据过期自动触发浏览器提取→HTML报告（v4.0修复）"
updated: "2026-07-02"
---

# revenue-diagnosis - VV渠道营收体检 v4.0

## 核心改进

1. **返回码10处理**：数据过期 → Agent自动执行浏览器提取
2. **二级密码**：`Qizige121`
3. **逐日LMDI分解**

## Agent执行流程

```
node scripts/run-diagnosis.mjs

返回码10 → 浏览器提取：

browser: action=start, profile=openclaw
browser: action=navigate, url=https://allcmsweb-pro.vvyyds.com/#/dataCenter/productData
browser: action=snapshot → 检查状态
browser: action=act, kind=type, text=Qizige121 (密码弹窗)
browser: action=snapshot → 找vv按钮ref
browser: action=act, kind=click, ref=<vv按钮ref>
browser: action=act, kind=wait, timeMs=2000
browser: action=snapshot → 提取数据
write: path=<技能目录>/raw_data.json
browser: action=stop

重新运行 → 生成HTML报告
```

## 返回码

| 码 | Agent动作 |
|----|----------|
| 0 | 返回结果 |
| 10 | 浏览器提取 |
| 1 | 报告问题 |
