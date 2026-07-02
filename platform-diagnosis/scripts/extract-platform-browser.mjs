#!/usr/bin/env node
/**
 * extract-platform-browser.mjs — 全平台数据提取（Browser Tool方式）
 * 
 * 提取全平台汇总数据，包括：
 * 1. 四维KPI看板（新增、活跃、留存、营收）
 * 2. 各平台详情数据（营收、新增、活跃及环比）
 * 3. 结构风险数据（HHI指数）
 * 
 * 执行步骤（已验证正确方法）：
 * 1. 导航到产品数据页面
 * 2. 点击全平台按钮，从营收表格提取各平台营收数据
 * 3. 点击"新增"卡片 → 跳转到新增Tab页（URL: ?tab=newEquipment）→ 提取各平台新增数据表格
 * 4. 点击"活跃"卡片 → 跳转到活跃Tab页（URL: ?tab=activeEquipment）→ 提取各平台活跃数据表格
 * 5. 合并数据并保存
 * 
 * 重要发现：
 * - 点击新增/活跃卡片会跳转到独立的Tab页，而不是展开图表
 * - 每个Tab页都有独立的表格，显示各平台的详细数据
 * - 平台顺序：vv、觅光、萤火、椰奶、可乐语音、青鸾直播
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_DIR = path.resolve(__dirname, '..');
const OUTPUT_FILE = path.join(SKILL_DIR, 'platform_raw.json');

console.log('========================================');
console.log('   全平台数据提取（Browser Tool）');
console.log('========================================\n');

// 平台列表（按表格顺序）
const PLATFORMS = ['vv', '觅光', '萤火', '椰奶', '可乐语音', '青鸾直播'];

// 提取计划
const extractionPlan = {
  steps: [
    { step: 1, action: 'start', description: '启动浏览器' },
    { step: 2, action: 'navigate', url: 'https://allcmsweb-pro.vvyyds.com/#/dataCenter/productData' },
    { step: 3, action: 'wait', duration: 2000 },
    { step: 4, action: 'click', target: '全平台按钮', description: '确保在全平台视图' },
    { step: 5, action: 'wait', duration: 1000 },
    { step: 6, action: 'snapshot', description: '找到营收卡片、新增卡片、活跃卡片的ref' },
    { step: 7, action: 'evaluate', fn: 'extract_revenue_table', description: '提取营收表格数据（各平台营收及占比）' },
    { step: 8, action: 'click', target: '新增卡片（ref=e279）', description: '点击新增卡片跳转到新增Tab页' },
    { step: 9, action: 'wait', duration: 2000 },
    { step: 10, action: 'snapshot', description: '查看新增页面数据结构' },
    { step: 11, action: 'evaluate', fn: 'extract_acquisition_table', description: '提取各平台新增数据' },
    { step: 12, action: 'click', target: '活跃卡片（ref=e294）', description: '点击活跃卡片跳转到活跃Tab页' },
    { step: 13, action: 'wait', duration: 2000 },
    { step: 14, action: 'snapshot', description: '查看活跃页面数据结构' },
    { step: 15, action: 'evaluate', fn: 'extract_active_table', description: '提取各平台活跃数据' },
    { step: 16, action: 'stop' },
    { step: 17, action: 'save', description: '保存合并数据' }
  ],
  notes: [
    '点击新增卡片会跳转到 ?tab=newEquipment 页面',
    '点击活跃卡片会跳转到 ?tab=activeEquipment 页面',
    '每个Tab页都有独立的表格，显示各平台的详细数据',
    '平台顺序：vv、觅光、萤火、椰奶、可乐语音、青鸾直播',
    '营收卡片ref: e262（或e259下的e262）',
    '新增卡片ref: e279（或e259下的e279）',
    '活跃卡片ref: e294（或e259下的e294）'
  ]
};

fs.writeFileSync(path.join(SKILL_DIR, 'extraction_plan.json'), JSON.stringify(extractionPlan, null, 2));
console.log('📊 提取计划已生成\n');

// ===============================
// JavaScript 提取代码
// ===============================

// 1. 提取营收表格数据
const extractRevenueCode = `
(function() {
  const result = {
    platforms: [],
    totals: {}
  };
  
  const parseNum = (text) => parseFloat(text?.replace(/[^0-9.]/g, '')) || 0;
  
  // 提取KPI汇总数据
  const revenueText = document.evaluate(
    "//h3[contains(text(), '营收')]/following::div[contains(text(), '元')]",
    document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
  ).singleNodeValue?.textContent;
  result.totals.revenueYesterday = parseNum(revenueText);
  
  const newUsersCard = document.evaluate(
    "//h3[contains(text(), '新增')]",
    document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
  ).singleNodeValue?.parentElement?.parentElement;
  const newUsersValue = newUsersCard?.querySelector('[ref]')?.textContent;
  result.totals.acquisitionYesterday = parseInt(newUsersValue?.replace(/[^0-9]/g, '')) || 0;
  
  const activeCard = document.evaluate(
    "//h3[contains(text(), '活跃')]",
    document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null
  ).singleNodeValue?.parentElement?.parentElement;
  const activeValue = activeCard?.querySelector('[ref]')?.textContent;
  result.totals.activeYesterday = parseInt(activeValue?.replace(/[^0-9]/g, '')) || 0;
  
  // 提取营收表格各平台数据
  const tables = document.querySelectorAll('.el-table');
  for (const table of tables) {
    const headers = Array.from(table.querySelectorAll('.el-table__header th')).map(th => th.textContent.trim());
    if (headers.includes('昨日充值') && headers.includes('昨日营收')) {
      const rows = Array.from(table.querySelectorAll('.el-table__body tr'));
      const platformNames = ['vv', '觅光', '萤火', '椰奶', '可乐语音', '青鸾直播'];
      rows.forEach((tr, idx) => {
        const tds = tr.querySelectorAll('td');
        const trendText = tds[5]?.textContent?.trim() || '';
        result.platforms.push({
          platform: platformNames[idx] || '未知',
          revenue: {
            yesterday: parseNum(tds[3]?.textContent),
            share: parseNum(tds[4]?.textContent),
            trend: trendText.includes('▲') ? '+' + trendText.match(/\\d+\\.?\\d*/)?.[0] + '%' : 
                  trendText.includes('▼') ? '-' + trendText.match(/\\d+\\.?\\d*/)?.[0] + '%' : '0%'
          }
        });
      });
    }
  }
  
  return result;
})()
`;

// 2. 提取新增表格数据（在新增Tab页执行）
const extractAcquisitionCode = `
(function() {
  const result = { platforms: [] };
  const parseIntNum = (text) => parseInt(text?.replace(/[^0-9]/g, '')) || 0;
  
  const tables = document.querySelectorAll('.el-table');
  for (const table of tables) {
    const headers = Array.from(table.querySelectorAll('.el-table__header th')).map(th => th.textContent.trim());
    if (headers.includes('昨日新增')) {
      const rows = Array.from(table.querySelectorAll('.el-table__body tr'));
      const platformNames = ['vv', '觅光', '萤火', '椰奶', '可乐语音', '青鸾直播'];
      rows.forEach((tr, idx) => {
        const tds = tr.querySelectorAll('td');
        const trendText = tds[3]?.textContent?.trim() || '';
        result.platforms.push({
          platform: platformNames[idx] || '未知',
          acquisition: {
            yesterday: parseIntNum(tds[2]?.textContent),
            trend: trendText.includes('▲') ? '+' + trendText.match(/\\d+\\.?\\d*/)?.[0] + '%' : 
                  trendText.includes('▼') ? '-' + trendText.match(/\\d+\\.?\\d*/)?.[0] + '%' : '0%'
          }
        });
      });
    }
  }
  
  return result;
})()
`;

// 3. 提取活跃表格数据（在活跃Tab页执行）
const extractActiveCode = `
(function() {
  const result = { platforms: [] };
  const parseIntNum = (text) => parseInt(text?.replace(/[^0-9]/g, '')) || 0;
  
  const tables = document.querySelectorAll('.el-table');
  for (const table of tables) {
    const headers = Array.from(table.querySelectorAll('.el-table__header th')).map(th => th.textContent.trim());
    if (headers.includes('昨日活跃')) {
      const rows = Array.from(table.querySelectorAll('.el-table__body tr'));
      const platformNames = ['vv', '觅光', '萤火', '椰奶', '可乐语音', '青鸾直播'];
      rows.forEach((tr, idx) => {
        const tds = tr.querySelectorAll('td');
        const trendText = tds[3]?.textContent?.trim() || '';
        result.platforms.push({
          platform: platformNames[idx] || '未知',
          active: {
            yesterday: parseIntNum(tds[2]?.textContent),
            trend: trendText.includes('▲') ? '+' + trendText.match(/\\d+\\.?\\d*/)?.[0] + '%' : 
                  trendText.includes('▼') ? '-' + trendText.match(/\\d+\\.?\\d*/)?.[0] + '%' : '0%'
          }
        });
      });
    }
  }
  
  return result;
})()
`;

console.log('========================================');
console.log('提取执行指南');
console.log('========================================\n');

console.log('步骤1: 启动浏览器');
console.log('  browser action=start');
console.log('');

console.log('步骤2: 导航到产品数据页面');
console.log('  browser action=navigate url=https://allcmsweb-pro.vvyyds.com/#/dataCenter/productData');
console.log('  browser action=act request={kind: "wait", timeMs: 2000}');
console.log('');

console.log('步骤3: 点击全平台按钮并获取快照');
console.log('  browser action=act request={kind: "click", ref: "全平台按钮"}');
console.log('  browser action=act request={kind: "wait", timeMs: 1000}');
console.log('  browser action=snapshot  // 找到营收卡片(e262)、新增卡片(e279)、活跃卡片(e294)的ref');
console.log('');

console.log('步骤4: 提取营收表格数据');
console.log('  browser action=act request={kind: "evaluate", fn: <extractRevenueCode>}');
console.log('');

console.log('步骤5: 点击新增卡片跳转到新增Tab页');
console.log('  browser action=act request={kind: "click", ref: "e279"}  // 新增卡片ref');
console.log('  browser action=act request={kind: "wait", timeMs: 2000}');
console.log('  browser action=snapshot  // 确认跳转到新增Tab页');
console.log('');

console.log('步骤6: 提取新增表格数据');
console.log('  browser action=act request={kind: "evaluate", fn: <extractAcquisitionCode>}');
console.log('');

console.log('步骤7: 点击活跃卡片跳转到活跃Tab页');
console.log('  browser action=act request={kind: "click", ref: "e294"}  // 活跃卡片ref');
console.log('  browser action=act request={kind: "wait", timeMs: 2000}');
console.log('  browser action=snapshot  // 确认跳转到活跃Tab页');
console.log('');

console.log('步骤8: 提取活跃表格数据');
console.log('  browser action=act request={kind: "evaluate", fn: <extractActiveCode>}');
console.log('');

console.log('步骤9: 关闭浏览器，保存数据');
console.log('  browser action=stop');
console.log('');

console.log('\n关键发现：');
console.log('  - 点击新增卡片会跳转到 ?tab=newEquipment 页面');
console.log('  - 点击活跃卡片会跳转到 ?tab=activeEquipment 页面');
console.log('  - 每个Tab页都有独立的表格显示各平台详细数据');
console.log('  - 平台顺序固定：vv、觅光、萤火、椰奶、可乐语音、青鸾直播');