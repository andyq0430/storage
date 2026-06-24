#!/usr/bin/env node
/**
 * extract-platform-browser.mjs — 全平台数据提取（Browser Tool方式）
 * 
 * 提取全平台汇总数据，包括：
 * 1. 四维KPI看板（新增、活跃、留存、营收）
 * 2. 各平台详情数据（营收、新增、活跃及环比）
 * 3. 结构风险数据（HHI指数）
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

// 提取计划（用于文档）
const extractionPlan = {
  steps: [
    { step: 1, action: 'start', description: '启动浏览器' },
    { step: 2, action: 'navigate', url: 'https://allcmsweb-pro.vvyyds.com/#/dataCenter/productData' },
    { step: 3, action: 'wait', duration: 3000 },
    { step: 4, action: 'input_password_if_needed', description: '如需要则输入二级密码' },
    { step: 5, action: 'click', selector: 'button:contains("全平台")', description: '点击全平台按钮' },
    { step: 6, action: 'wait', duration: 5000 },
    { step: 7, action: 'evaluate', fn: 'extract_all_data', description: '提取全平台数据' },
    { step: 8, action: 'stop' }
  ]
};

// 保存提取计划
fs.writeFileSync(path.join(SKILL_DIR, 'extraction_plan.json'), JSON.stringify(extractionPlan, null, 2));
console.log('📊 提取计划已生成\n');

// JavaScript提取代码（用于browser tool evaluate）
const extractCode = `
(function() {
  const result = {
    meta: {
      extractedAt: new Date().toISOString(),
      platform: 'all',
      dateRange: {
        yesterday: '2026-06-22',
        today: '2026-06-23',
        lastWeek: '2026-06-16 ~ 2026-06-22'
      }
    },
    kpiSummary: {},
    platforms: [],
    totals: {}
  };
  
  // 提取KPI卡片（营收、新增、活跃、留存）
  const kpiCards = document.querySelectorAll('.el-col');
  kpiCards.forEach(card => {
    const h3 = card.querySelector('h3');
    if (h3) {
      const title = h3.textContent.trim();
      const valueEl = card.querySelector('.el-statistic__number, [class*="value"]');
      const value = valueEl ? valueEl.textContent.trim() : '';
      const changeEl = card.querySelector('p');
      const changeText = changeEl ? changeEl.textContent.trim() : '';
      
      if (title && value) {
        result.kpiSummary[title] = { value, change: changeText };
      }
    }
  });
  
  // 提取营收表格数据（包含各平台详情）
  const tables = document.querySelectorAll('.el-table');
  
  // 找到营收数据表格（第一个包含昨日营收的表格）
  let revenueTable = null;
  let platformTable = null;
  
  tables.forEach((table, idx) => {
    const headers = Array.from(table.querySelectorAll('.el-table__header th')).map(th => th.textContent.trim());
    if (headers.some(h => h.includes('昨日营收'))) {
      revenueTable = table;
    }
    if (headers.some(h => h.includes('平台名称'))) {
      platformTable = table;
    }
  });
  
  // 提取各平台营收数据
  if (revenueTable) {
    const rows = revenueTable.querySelectorAll('.el-table__body tr');
    rows.forEach((tr, idx) => {
      const tds = tr.querySelectorAll('td');
      if (tds.length >= 8) {
        const yesterdayRevenue = parseFloat(tds[2]?.textContent?.replace(/[^0-9.]/g, '') || '0');
        const revenueShare = parseFloat(tds[4]?.textContent?.replace(/[^0-9.]/g, '') || '0');
        const revenueTrendEl = tds[5]?.textContent?.trim() || '';
        const revenueTrend = revenueTrendEl.includes('▲') ? '+' + revenueTrendEl.replace(/[^0-9.]/g, '') : 
                            revenueTrendEl.includes('▼') ? '-' + revenueTrendEl.replace(/[^0-9.]/g, '') : '0';
        
        // 尝试从文本中提取更多信息
        const fullText = tr.textContent;
        
        result.platforms.push({
          platform: '', // 平台名称从另一个表格获取
          revenue: {
            yesterday: yesterdayRevenue,
            share: revenueShare,
            trend: revenueTrend + '%'
          },
          rawData: fullText
        });
      }
    });
  }
  
  // 从平台名称表格获取平台名并匹配
  if (platformTable) {
    const nameRows = platformTable.querySelectorAll('.el-table__body tr');
    nameRows.forEach((tr, idx) => {
      const tds = tr.querySelectorAll('td');
      if (tds.length >= 2) {
        const platformName = tds[1]?.textContent?.trim() || '';
        if (platformName && result.platforms[idx]) {
          result.platforms[idx].platform = platformName;
        }
      }
    });
  }
  
  // 从页面直接解析KPI看板
  const overviewCards = document.querySelectorAll('[class*="overview"], [class*="dashboard"]');
  
  // 营收卡片
  const revenueCard = document.querySelector('[class*="营收"]');
  if (revenueCard) {
    const valueEl = revenueCard.querySelector('.el-statistic__number');
    if (valueEl) {
      result.totals.revenueYesterday = parseFloat(valueEl.textContent.replace(/[^0-9.]/g, ''));
    }
  }
  
  // 新增卡片
  const newUsersEl = document.evaluate("//h3[contains(text(), '新增')]/following::div[contains(@class, 'el-statistic') or contains(@class, 'value')]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  if (newUsersEl) {
    result.totals.newUsersYesterday = parseInt(newUsersEl.textContent.replace(/[^0-9]/g, ''));
  }
  
  // 活跃卡片
  const activeEl = document.evaluate("//h3[contains(text(), '活跃')]/following::div[contains(@class, 'el-statistic') or contains(@class, 'value')]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  if (activeEl) {
    result.totals.dauYesterday = parseInt(activeEl.textContent.replace(/[^0-9]/g, ''));
  }
  
  // 留存卡片
  const retentionEl = document.evaluate("//h3[contains(text(), '留存')]/following::div[contains(@class, 'el-statistic') or contains(@class, 'value')]", document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  if (retentionEl) {
    result.totals.avgRetention = parseFloat(retentionEl.textContent.replace(/[^0-9.]/g, ''));
  }
  
  // 计算HHI
  if (result.platforms.length > 0) {
    const totalRev = result.platforms.reduce((sum, p) => sum + (p.revenue?.yesterday || 0), 0);
    if (totalRev > 0) {
      result.hhi = result.platforms.reduce((sum, p) => {
        const share = (p.revenue?.yesterday || 0) / totalRev * 100;
        return sum + share * share;
      }, 0);
    }
  }
  
  return result;
})()
`;

console.log('提取代码已生成，请使用 browser tool 执行以下步骤：');
console.log('');
console.log('1. action=start');
console.log('2. action=navigate url=https://allcmsweb-pro.vvyyds.com/#/dataCenter/productData');
console.log('3. 输入二级密码（如需要）');
console.log('4. action=act request={kind: "click", ref: "全平台按钮"}');
console.log('5. action=act request={kind: "evaluate", fn: <上面的提取代码>}');
console.log('6. action=stop');
console.log('');
console.log('提取代码已保存到 extraction_plan.json');
