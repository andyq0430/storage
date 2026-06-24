#!/usr/bin/env node
/**
 * extract-revenue-browser.mjs — 营收数据提取（Browser Tool方式）
 * 
 * 使用OpenClaw browser tool从VV总控系统提取营收数据
 * 
 * 用法：node extract-revenue-browser.mjs
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
console.log('   Revenue数据提取（Browser Tool）');
console.log('========================================\n');

/**
 * 此脚本演示如何使用browser tool提取数据
 * 
 * 实际执行流程：
 * 1. browser({action:"start", profile:"user"}) - 启动浏览器
 * 2. browser({action:"navigate", url:BASE_URL}) - 导航到页面
 * 3. browser({action:"snapshot"}) - 获取页面状态
 * 4. browser({action:"act", request:{kind:"click", ref:"..."}}) - 点击vv按钮
 * 5. browser({action:"snapshot"}) - 获取新状态
 * 6. browser({action:"act", request:{kind:"click", ref:"..."}}) - 点击营收tab
 * 7. browser({action:"snapshot"}) - 获取表格refs
 * 8. browser({action:"act", request:{kind:"evaluate", fn:"..."}}) - 提取数据
 * 9. browser({action:"stop"}) - 关闭浏览器
 */

// 数据提取逻辑示意
const extractionPlan = {
  steps: [
    {
      step: 1,
      action: 'start',
      description: '启动浏览器',
      params: { profile: 'user', url: BASE_URL }
    },
    {
      step: 2,
      action: 'wait',
      description: '等待页面加载',
      duration: 3000
    },
    {
      step: 3,
      action: 'snapshot',
      description: '获取初始快照',
      expected: 'h3标签列表：新增、活跃、留存、营收'
    },
    {
      step: 4,
      action: 'click',
      description: '点击vv按钮',
      selector: 'button:contains("vv")'
    },
    {
      step: 5,
      action: 'wait',
      description: '等待vv数据加载',
      duration: 2000
    },
    {
      step: 6,
      action: 'click',
      description: '点击营收标签',
      selector: 'h3:contains("营收")'
    },
    {
      step: 7,
      action: 'wait',
      description: '等待营收表格加载',
      duration: 3000
    },
    {
      step: 8,
      action: 'evaluate',
      description: '提取基础营收数据',
      fn: `(() => {
        const table = document.querySelectorAll('.el-table')[0];
        const rows = Array.from(table.querySelectorAll('.el-table__body tr'));
        return rows.slice(0, 8).map(tr => {
          const tds = tr.querySelectorAll('td');
          return {
            date: tds[0]?.textContent.trim(),
            revenue: parseFloat(tds[3]?.textContent.replace(/[^0-9.]/g, '')),
            payUsers: parseInt(tds[6]?.textContent.replace(/[^0-9]/g, '')),
            payRate: parseFloat(tds[7]?.textContent.replace(/[^0-9.]/g, '')),
            arppu: parseFloat(tds[10]?.textContent.replace(/[^0-9.]/g, ''))
          };
        }).filter(r => r.date && r.revenue > 0);
      })()`
    },
    {
      step: 9,
      action: 'evaluate',
      description: '提取用户消费TOP榜',
      fn: `(() => {
        const table = document.querySelectorAll('.el-table')[6];
        const rows = Array.from(table.querySelectorAll('.el-table__body tr'));
        return rows.slice(0, 10).map(tr => {
          const tds = tr.querySelectorAll('td');
          return {
            rank: parseInt(tds[1]?.textContent),
            name: tds[3]?.textContent.trim(),
            amount: parseFloat(tds[4]?.textContent.replace(/[^0-9.]/g, '')),
            share: parseFloat(tds[7]?.textContent.replace(/[^0-9.]/g, ''))
          };
        });
      })()`
    },
    {
      step: 10,
      action: 'evaluate',
      description: '提取付费分档数据',
      fn: `(() => {
        const table = document.querySelectorAll('.el-table')[11];
        const rows = Array.from(table.querySelectorAll('.el-table__body tr'));
        return rows.slice(0, 10).map(tr => {
          const tds = tr.querySelectorAll('td');
          return {
            tier: tds[2]?.textContent.trim(),
            count: parseInt(tds[3]?.textContent.replace(/[^0-9]/g, '')),
            amount: parseFloat(tds[6]?.textContent.replace(/[^0-9.]/g, ''))
          };
        });
      })()`
    },
    {
      step: 11,
      action: 'stop',
      description: '关闭浏览器'
    }
  ]
};

// 保存提取计划
fs.writeFileSync(
  path.join(SKILL_DIR, 'extraction_plan.json'),
  JSON.stringify(extractionPlan, null, 2)
);

console.log('📊 数据提取计划已生成');
console.log('📄 extraction_plan.json');
console.log('\n⚠️  重要说明：');
console.log('此脚本需要通过OpenClaw runtime调用browser tool才能实际执行');
console.log('\n执行方式：');
console.log('1. OpenClaw runtime自动调用browser tool');
console.log('2. 按照extraction_plan.json中的步骤执行');
console.log('3. 返回提取的数据并保存到raw_data.json');
console.log('\n下一步：');
console.log('node scripts/filter-recent-days.mjs 7');
console.log('node scripts/run-diagnosis.mjs');

// 创建占位数据
const placeholderData = {
  meta: {
    extractedAt: new Date().toISOString(),
    method: 'browser-tool',
    status: 'pending',
    note: '需要通过OpenClaw runtime实际执行'
  },
  extractionPlan: extractionPlan.steps
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(placeholderData, null, 2));
console.log(`\n📄 占位数据已保存: ${OUTPUT_FILE}`);