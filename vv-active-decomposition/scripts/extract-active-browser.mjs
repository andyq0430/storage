#!/usr/bin/env node
/**
 * extract-active-browser.mjs — 活跃数据提取（Browser Tool方式）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_DIR = path.resolve(__dirname, '..');
const OUTPUT_FILE = path.join(SKILL_DIR, 'raw_data.json');

const BASE_URL = 'https://allcmsweb-pro.vvyyds.com/#/dataCenter/productData';

console.log('========================================');
console.log('   Active数据提取（Browser Tool）');
console.log('========================================\n');

const extractionPlan = {
  steps: [
    { step: 1, action: 'start', params: { profile: 'user', url: BASE_URL } },
    { step: 2, action: 'wait', duration: 3000 },
    { step: 3, action: 'snapshot' },
    { step: 4, action: 'click', selector: 'button:contains("vv")' },
    { step: 5, action: 'wait', duration: 2000 },
    { step: 6, action: 'click', selector: 'h3:contains("活跃")' },
    { step: 7, action: 'wait', duration: 3000 },
    {
      step: 8,
      action: 'evaluate',
      fn: `(() => {
        const tables = document.querySelectorAll('.el-table');
        const result = { banKuai: [], shiYong: [] };
        
        // 板块活跃数据
        const table1 = tables[1];
        if (table1) {
          const rows = Array.from(table1.querySelectorAll('.el-table__body tr'));
          result.banKuai = rows.slice(0, 8).map(tr => {
            const tds = tr.querySelectorAll('td');
            return {
              date: tds[0]?.textContent.trim(),
              dau: parseInt(tds[1]?.textContent.replace(/[^0-9]/g, '')),
              jinFang: parseInt(tds[5]?.textContent.replace(/[^0-9]/g, ''))
            };
          }).filter(r => r.date && r.dau > 0);
        }
        
        // 使用时长数据
        const table3 = tables[3];
        if (table3) {
          const rows = Array.from(table3.querySelectorAll('.el-table__body tr'));
          result.shiYong = rows.slice(0, 8).map(tr => {
            const tds = tr.querySelectorAll('td');
            return {
              date: tds[0]?.textContent.trim(),
              avgDuration: parseFloat(tds[3]?.textContent.replace(/[^0-9.]/g, ''))
            };
          }).filter(r => r.date && r.avgDuration > 0);
        }
        
        return result;
      })()`
    },
    { step: 9, action: 'stop' }
  ]
};

fs.writeFileSync(path.join(SKILL_DIR, 'extraction_plan.json'), JSON.stringify(extractionPlan, null, 2));
console.log('📊 活跃数据提取计划已生成');
console.log('下一步: node scripts/filter-recent-days.mjs 7');

const placeholderData = {
  meta: { extractedAt: new Date().toISOString(), method: 'browser-tool', status: 'pending' },
  extractionPlan: extractionPlan.steps
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(placeholderData, null, 2));
console.log(`📄 占位数据已保存: ${OUTPUT_FILE}`);