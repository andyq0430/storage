#!/usr/bin/env node
/**
 * auto-extract-ltv.mjs — 自动浏览器提取VV渠道LTV数据
 * 
 * 功能：
 *   - 自动启动浏览器
 *   - 导航到VV总控管理系统
 *   - 提取渠道LTV和用户质量数据
 *   - 保存到 raw_data.json
 * 
 * 用法：
 *   node scripts/auto-extract-ltv.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_DIR = path.resolve(__dirname, '..');
const OUTPUT_FILE = path.join(SKILL_DIR, 'raw_data.json');

const BASE_URL = 'https://allcmsweb-pro.vvyyds.com/#/dataCenter/productData';

console.log('━'.repeat(70));
console.log('   VV渠道LTV数据自动提取');
console.log('━'.repeat(70));
console.log('');

// 生成浏览器操作指令
const browserInstructions = {
  targetUrl: BASE_URL,
  steps: [
    {
      order: 1,
      action: 'navigate',
      description: '导航到产品数据页面',
      url: BASE_URL
    },
    {
      order: 2,
      action: 'wait',
      duration: 3000,
      description: '等待页面加载'
    },
    {
      order: 3,
      action: 'snapshot',
      description: '检查页面状态，确认是否需要登录或输入二级密码'
    },
    {
      order: 4,
      action: 'click',
      description: '点击vv按钮选择平台',
      selector: 'button:has-text("vv")',
      fallback: '点击平台选择器中的vv选项'
    },
    {
      order: 5,
      action: 'wait',
      duration: 2000,
      description: '等待数据加载'
    },
    {
      order: 6,
      action: 'click',
      description: '点击"新增"标签切换到新增用户数据',
      selector: 'h3:has-text("新增")',
      fallback: '点击新增Tab页'
    },
    {
      order: 7,
      action: 'wait',
      duration: 3000,
      description: '等待新增数据表格加载'
    },
    {
      order: 8,
      action: 'extract',
      description: '提取渠道LTV表格和用户质量表格数据',
      evaluateScript: `(() => {
        const tables = document.querySelectorAll('.el-table');
        const result = { ltvData: [], qualityData: [] };
        
        // 渠道LTV表格（通常是第二个表格）
        const table1 = tables[1];
        if (table1) {
          const rows = Array.from(table1.querySelectorAll('.el-table__body tr'));
          result.ltvData = rows.map(tr => {
            const tds = tr.querySelectorAll('td');
            const dateText = tds[0]?.textContent.trim() || '';
            const newUsersText = tds[1]?.textContent.replace(/[^0-9]/g, '') || '0';
            
            return {
              date: dateText,
              newUsers: parseInt(newUsersText) || 0,
              ltv1: parseFloat(tds[2]?.textContent.replace(/[^0-9.]/g, '')) || 0,
              ltv3: parseFloat(tds[3]?.textContent.replace(/[^0-9.]/g, '')) || 0,
              ltv7: parseFloat(tds[4]?.textContent.replace(/[^0-9.]/g, '')) || 0,
              ltv15: parseFloat(tds[5]?.textContent.replace(/[^0-9.]/g, '')) || 0,
              ltv30: parseFloat(tds[6]?.textContent.replace(/[^0-9.]/g, '')) || 0,
              ltv60: parseFloat(tds[7]?.textContent.replace(/[^0-9.]/g, '')) || 0
            };
          }).filter(r => r.date && r.newUsers > 0);
        }
        
        // 用户质量表格（通常是第三个表格）
        const table2 = tables[2];
        if (table2) {
          const rows = Array.from(table2.querySelectorAll('.el-table__body tr'));
          result.qualityData = rows.map(tr => {
            const tds = tr.querySelectorAll('td');
            const dateText = tds[0]?.textContent.trim() || '';
            const newUsersText = tds[1]?.textContent.replace(/[^0-9]/g, '') || '0';
            
            return {
              date: dateText,
              channel: '全部',
              newUsers: parseInt(newUsersText) || 0,
              payRateD0: parseFloat(tds[2]?.textContent.replace(/[^0-9.]/g, '')) || 0,
              payAmountD0: parseFloat(tds[3]?.textContent.replace(/[^0-9.]/g, '')) || 0,
              payAmountD7: parseFloat(tds[4]?.textContent.replace(/[^0-9.]/g, '')) || 0
            };
          }).filter(r => r.date && r.newUsers > 0);
        }
        
        return result;
      })()`
    }
  ]
};

console.log('📍 目标URL:', BASE_URL);
console.log('');
console.log('📋 自动提取流程：');
browserInstructions.steps.forEach(step => {
  console.log(`   ${step.order}. ${step.description}`);
});
console.log('');

// 保存提取指令供参考
const instructionFile = path.join(SKILL_DIR, 'extraction_instructions.json');
fs.writeFileSync(instructionFile, JSON.stringify(browserInstructions, null, 2));
console.log('📄 提取指令已保存:', instructionFile);
console.log('');

// 输出供 Agent 执行的指令
console.log('━'.repeat(70));
console.log('🤖 请使用 browser tool 执行以下操作：');
console.log('━'.repeat(70));
console.log('');
console.log('1. 启动浏览器并导航：');
console.log(`   action: start, profile: user, url: ${BASE_URL}`);
console.log('');
console.log('2. 等待页面加载（3秒）');
console.log('');
console.log('3. 拍摄快照检查页面状态');
console.log('');
console.log('4. 点击 vv 按钮');
console.log('');
console.log('5. 点击"新增"标签');
console.log('');
console.log('6. 等待数据加载（3秒）');
console.log('');
console.log('7. 执行 JS 提取数据');
console.log('');
console.log('8. 关闭浏览器');
console.log('');

// 创建占位数据文件，标记等待提取
const placeholderData = {
  meta: {
    extractedAt: new Date().toISOString(),
    method: 'browser-tool-auto',
    status: 'pending',
    instructionFile: instructionFile
  },
  ltvData: [],
  qualityData: [],
  dateRange: null
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(placeholderData, null, 2));
console.log('📄 占位数据已保存:', OUTPUT_FILE);
console.log('');
console.log('等待浏览器提取完成后，运行: node scripts/transform-data.mjs');
