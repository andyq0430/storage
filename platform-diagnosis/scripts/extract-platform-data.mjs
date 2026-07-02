#!/usr/bin/env node
/**
 * extract-platform-data.mjs — 平台数据浏览器提取脚本
 * 
 * 此脚本提供数据提取逻辑说明，实际提取由 Agent 通过 browser tool 执行
 * 
 * ## 页面结构分析
 * 
 * ### KPI卡片位置
 * - 营收：heading "营收" → generic "1658504.05元" → paragraph "同比昨日(...) 上升16.69%"
 * - 新增：heading "新增" → generic "2888" → paragraph "同比昨日(...) 下滑4.72%"
 * - 活跃：heading "活跃" → generic "25444" → paragraph "环比上周(...) 上升1.26%"
 * - 留存：heading "留存（平均值）" → generic "35.42%" → paragraph "同比昨日(...) 上升0.88%"
 * 
 * ### 平台数据表格
 * 页面有两个 el-table：
 * 1. 第一个表格：营收数据（6行，按昨日营收倒序）
 * 2. 第二个表格：平台名称（顺序与营收表不同！）
 * 
 * **关键点**：必须使用固定顺序匹配平台名，因为两个表格顺序不一致！
 * 营收倒序固定顺序：vv > 觅光 > 萤火 > 椰奶 > 可乐语音 > 青鸾直播
 * 
 * ### 表格列定义（第一个表格，0-indexed）
 * - cells[0], cells[1]: 空列
 * - cells[2]: 昨日充值
 * - cells[3]: 昨日营收 ← 提取目标
 * - cells[4]: 昨日营收占比 ← 提取目标
 * - cells[5]: 环比前一天营收 ← 提取目标（含▲/▼）
 * - cells[6]-cells[7]: 当日充值/营收
 * - ...
 */

// ===== 数据提取逻辑 =====

/**
 * 从 snapshot 提取 KPI 数据
 * 
 * @param {string} snapshotText - browser snapshot 输出文本
 * @returns {Object} KPI数据对象
 */
function extractKPIFromSnapshot(snapshotText) {
  const kpiCards = {};
  const totals = {};
  
  // 营收：匹配 "XXX.XX元" 和 "上升/下滑XX.XX%"
  const revenueMatch = snapshotText.match(/(\d+\.?\d*)元[\s\S]*?(上升|下滑)(\d+\.?\d*)%/);
  if (revenueMatch) {
    const value = parseFloat(revenueMatch[1]);
    const change = revenueMatch[2] === '上升' 
      ? parseFloat(revenueMatch[3]) 
      : -parseFloat(revenueMatch[3]);
    kpiCards['营收'] = {
      value,
      change: change >= 0 ? `▲${Math.abs(change)}%` : `▼${Math.abs(change)}%`,
      _change: change
    };
    totals.revenueYesterday = value;
  }
  
  // 新增：匹配 "新增" 后的数字
  const acqMatch = snapshotText.match(/新增[^\d]*(\d+)[^\d]*(上升|下滑)(\d+\.?\d*)%/);
  if (acqMatch) {
    const value = parseInt(acqMatch[1]);
    const change = acqMatch[2] === '上升' 
      ? parseFloat(acqMatch[3]) 
      : -parseFloat(acqMatch[3]);
    kpiCards['新增'] = {
      value,
      change: change >= 0 ? `▲${Math.abs(change)}%` : `▼${Math.abs(change)}%`,
      _change: change
    };
    totals.acquisitionYesterday = value;
  }
  
  // 活跃：匹配 "活跃" 后的数字
  const activeMatch = snapshotText.match(/活跃[^\d]*(\d+)[^\d]*(上升|下滑)(\d+\.?\d*)%/);
  if (activeMatch) {
    const value = parseInt(activeMatch[1]);
    const change = activeMatch[2] === '上升' 
      ? parseFloat(activeMatch[3]) 
      : -parseFloat(activeMatch[3]);
    kpiCards['活跃'] = {
      value,
      change: change >= 0 ? `▲${Math.abs(change)}%` : `▼${Math.abs(change)}%`,
      _change: change
    };
    totals.activeYesterday = value;
  }
  
  // 留存：匹配 "留存" 后的百分比（取平均值，忽略表格异常值）
  const retentionMatch = snapshotText.match(/留存[^\d]*(\d+\.?\d*)%[^\d]*(上升|下滑)(\d+\.?\d*)%/);
  if (retentionMatch) {
    const value = parseFloat(retentionMatch[1]);
    const change = retentionMatch[2] === '上升' 
      ? parseFloat(retentionMatch[3]) 
      : -parseFloat(retentionMatch[3]);
    kpiCards['留存'] = {
      value,
      change: change >= 0 ? `▲${Math.abs(change)}%` : `▼${Math.abs(change)}%`,
      _change: change
    };
    totals.retentionYesterday = value;
  }
  
  return { kpiCards, totals };
}

/**
 * 从表格数据提取平台信息
 * 
 * @param {Array} tableRows - 表格行数据
 * @returns {Array} 平台数据数组
 */
function extractPlatformsFromTable(tableRows) {
  // 平台固定顺序（按营收占比从大到小）
  const platformOrder = ['vv', '觅光', '萤火', '椰奶', '可乐语音', '青鸾直播'];
  
  return tableRows.slice(0, 6).map((row, idx) => {
    const revenue = parseFloat(row.cells[3]?.textContent?.replace(/,/g, '') || '0');
    const share = parseFloat(row.cells[4]?.textContent?.replace('%', '') || '0');
    const changeText = row.cells[5]?.textContent?.trim() || '';
    
    let change = 0;
    if (changeText.includes('▲')) {
      const m = changeText.match(/▲\s*(\d+\.?\d*)/);
      if (m) change = parseFloat(m[1]);
    } else if (changeText.includes('▼')) {
      const m = changeText.match(/▼\s*(\d+\.?\d*)/);
      if (m) change = -parseFloat(m[1]);
    }
    
    return {
      name: platformOrder[idx],
      revenue: {
        yesterday: revenue,
        share,
        change: change >= 0 ? `▲${Math.abs(change)}%` : `▼${Math.abs(change)}%`,
        _change: change
      }
    };
  });
}

// ===== 导出提取函数 =====
export { extractKPIFromSnapshot, extractPlatformsFromTable };

// ===== 使用说明 =====
console.log(`
=== 平台数据提取说明 ===

Agent 执行步骤：

1. browser action=snapshot
   获取页面快照文本

2. 从快照识别 KPI 数据：
   - 营收卡片：找 heading "营收" 后的数值
   - 新增卡片：找 heading "新增" 后的数值
   - 活跃卡片：找 heading "活跃" 后的数值
   - 留存卡片：找 heading "留存（平均值）" 后的数值

3. 从表格提取平台数据：
   - 定位第一个 el-table（包含"昨日营收"列）
   - 按行顺序提取6行数据
   - 使用固定平台名顺序匹配

4. 构建 JSON 并写入 platform_raw.json

关键注意事项：
- 变化率方向由文本"上升"/"下滑"决定，不是▲/▼符号
- 留存表格的逐日值（200%+）是系统bug，只取平均值
- 平台名顺序固定，不可从第二个表格读取
- _change 字段必须是带符号的数值
`);