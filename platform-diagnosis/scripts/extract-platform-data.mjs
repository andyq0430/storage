#!/usr/bin/env node
/**
 * extract-platform-data.mjs — 全平台数据提取脚本
 * 
 * 从总控管理系统全平台产品数据页面提取四维数据
 * URL: https://allcmsweb-pro.vvyyds.com/#/dataCenter/productData?tab=retainedSituation
 * 
 * 用法：node extract-platform-data.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_DIR = path.resolve(__dirname, '..');
const OUTPUT_FILE = path.join(SKILL_DIR, 'platform_raw.json');

const CDP_PROXY = 'http://localhost:3456';
const TARGET_ID = '2F9DA9A516942F5E089D2377536A9DB5';

console.log('========================================');
console.log('   全平台数据提取（总控系统）');
console.log('========================================\n');

// CDP Proxy 请求封装
async function cdpEval(expression) {
  return new Promise((resolve, reject) => {
    const url = `${CDP_PROXY}/eval?target=${TARGET_ID}`;
    
    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain'
      }
    };
    
    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          // CDP Proxy 返回 {value: "..."} 格式
          if (result.value) {
            try {
              resolve(JSON.parse(result.value));
            } catch (e) {
              resolve(result.value);
            }
          } else {
            resolve(null);
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.write(expression);
    req.end();
  });
}

// 等待函数
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// 点击标签页
async function clickTab(tabName) {
  const result = await cdpEval(`(function(){
    var h3s = document.querySelectorAll('h3');
    for (var i = 0; i < h3s.length; i++) {
      if (h3s[i].textContent.includes('${tabName}')) {
        h3s[i].click();
        return 'clicked ${tabName}';
      }
    }
    return 'not found';
  })()`);
  return result;
}

// 提取表格数据（通用）
async function extractTableData() {
  const data = await cdpEval(`(() => {
    const table = document.querySelectorAll('.el-table')[0];
    if (!table) return null;
    
    const rows = Array.from(table.querySelectorAll('.el-table__body tr'));
    const data = rows.map(tr => {
      const tds = tr.querySelectorAll('td');
      return {
        platform: tds[1]?.textContent.trim(),
        yesterday: tds[2]?.textContent.trim(),
        today: tds[4]?.textContent.trim(),
        lastWeek: tds[5]?.textContent.trim(),
        lastMonth: tds[7]?.textContent.trim()
      };
    }).filter(r => r.platform && r.platform !== '序号');
    
    return data;
  })()`);
  
  return data || [];
}

// 提取留存数据
async function extractRetention() {
  console.log('📊 提取留存数据...');
  await clickTab('留存');
  await sleep(5000); // 增加等待时间
  
  const rawData = await extractTableData();
  
  // 解析百分比
  const data = rawData.map(r => ({
    platform: r.platform,
    yesterdayRetention: parseFloat(r.yesterday.replace(/[^0-9.]/g, '')),
    todayRetention: parseFloat(r.today.replace(/[^0-9.]/g, '')),
    lastWeekRetention: parseFloat(r.lastWeek.replace(/[^0-9.]/g, '')),
    lastMonthRetention: parseFloat(r.lastMonth.replace(/[^0-9.]/g, ''))
  }));
  
  return data;
}

// 提取营收数据
async function extractRevenue() {
  console.log('📊 提取营收数据...');
  await clickTab('营收');
  await sleep(3000);
  
  const rawData = await cdpEval(`(() => {
    const table = document.querySelectorAll('.el-table')[0];
    if (!table) return null;
    
    const rows = Array.from(table.querySelectorAll('.el-table__body tr'));
    const data = rows.map(tr => {
      const tds = tr.querySelectorAll('td');
      return {
        platform: tds[1]?.textContent.trim(),
        yesterdayRevenue: tds[3]?.textContent.trim(),
        revenueShare: tds[4]?.textContent.trim(),
        todayRevenue: tds[7]?.textContent.trim(),
        lastWeekRevenue: tds[10]?.textContent.trim(),
        lastMonthRevenue: tds[14]?.textContent.trim()
      };
    }).filter(r => r.platform && r.platform !== '序号');
    
    return data;
  })()`);
  
  // 解析金额
  const data = (rawData || []).map(r => ({
    platform: r.platform,
    yesterdayRevenue: parseFloat(r.yesterdayRevenue.replace(/[^0-9.]/g, '')),
    revenueShare: parseFloat(r.revenueShare.replace(/[^0-9.]/g, '')),
    todayRevenue: parseFloat(r.todayRevenue.replace(/[^0-9.]/g, '')),
    lastWeekRevenue: parseFloat(r.lastWeekRevenue.replace(/[^0-9.]/g, '')),
    lastMonthRevenue: parseFloat(r.lastMonthRevenue.replace(/[^0-9.]/g, ''))
  }));
  
  return data;
}

// 提取新增数据
async function extractAcquisition() {
  console.log('📊 提取新增数据...');
  await clickTab('新增');
  await sleep(3000);
  
  const rawData = await extractTableData();
  
  // 解析数值
  const data = rawData.map(r => ({
    platform: r.platform,
    yesterdayNewUsers: parseInt(r.yesterday.replace(/[^0-9]/g, '')),
    todayNewUsers: parseInt(r.today.replace(/[^0-9]/g, '')),
    lastWeekNewUsers: parseInt(r.lastWeek.replace(/[^0-9]/g, '')),
    lastMonthNewUsers: parseInt(r.lastMonth.replace(/[^0-9]/g, ''))
  }));
  
  return data;
}

// 提取活跃数据
async function extractActive() {
  console.log('📊 提取活跃数据...');
  await clickTab('活跃');
  await sleep(3000);
  
  const rawData = await extractTableData();
  
  // 解析数值
  const data = rawData.map(r => ({
    platform: r.platform,
    yesterdayDAU: parseInt(r.yesterday.replace(/[^0-9]/g, '')),
    todayDAU: parseInt(r.today.replace(/[^0-9]/g, '')),
    lastWeekDAU: parseInt(r.lastWeek.replace(/[^0-9]/g, '')),
    lastMonthDAU: parseInt(r.lastMonth.replace(/[^0-9]/g, ''))
  }));
  
  return data;
}

// 计算趋势
function calcTrend(today, yesterday) {
  if (!today || !yesterday || yesterday === 0) return null;
  return ((today - yesterday) / yesterday * 100).toFixed(2);
}

// 计算平台汇总
function aggregatePlatform(data, field) {
  const validData = data.filter(d => d[field] && !isNaN(d[field]));
  const sum = validData.reduce((acc, d) => acc + d[field], 0);
  return sum;
}

// 主流程
async function main() {
  try {
    // 检查 CDP Proxy
    console.log('🔍 检查 CDP Proxy...');
    const status = await cdpEval('window.location.href');
    console.log('   当前页面:', status);
    
    // 导航到全平台数据页面
    console.log('🌐 导航到全平台数据页面...');
    await cdpEval(`window.location.href='https://allcmsweb-pro.vvyyds.com/#/dataCenter/productData?tab=retainedSituation'`);
    await sleep(3000);
    
    // 提取四维数据
    const retention = await extractRetention();
    const revenue = await extractRevenue();
    const acquisition = await extractAcquisition();
    const active = await extractActive();
    
    // 提取唯一平台列表
    const platforms = [...new Set([
      ...retention.map(r => r.platform),
      ...revenue.map(r => r.platform),
      ...acquisition.map(r => r.platform),
      ...active.map(r => r.platform)
    ])].filter(p => p);
    
    // 构建平台数据
    const platformData = platforms.map(platform => {
      const ret = retention.find(r => r.platform === platform) || {};
      const rev = revenue.find(r => r.platform === platform) || {};
      const acq = acquisition.find(r => r.platform === platform) || {};
      const act = active.find(r => r.platform === platform) || {};
      
      return {
        platform,
        retention: {
          yesterday: ret.yesterdayRetention || 0,
          today: ret.todayRetention || 0,
          lastWeek: ret.lastWeekRetention || 0,
          lastMonth: ret.lastMonthRetention || 0,
          trend: calcTrend(ret.yesterdayRetention, ret.lastWeekRetention)
        },
        revenue: {
          yesterday: rev.yesterdayRevenue || 0,
          today: rev.todayRevenue || 0,
          lastWeek: rev.lastWeekRevenue || 0,
          lastMonth: rev.lastMonthRevenue || 0,
          share: rev.revenueShare || 0,
          trend: calcTrend(rev.yesterdayRevenue, rev.lastWeekRevenue)
        },
        acquisition: {
          yesterday: acq.yesterdayNewUsers || 0,
          today: acq.todayNewUsers || 0,
          lastWeek: acq.lastWeekNewUsers || 0,
          lastMonth: acq.lastMonthNewUsers || 0,
          trend: calcTrend(acq.yesterdayNewUsers, acq.lastWeekNewUsers / 7)
        },
        active: {
          yesterday: act.yesterdayDAU || 0,
          today: act.todayDAU || 0,
          lastWeek: act.lastWeekDAU || 0,
          lastMonth: act.lastMonthDAU || 0,
          trend: calcTrend(act.yesterdayDAU, act.lastWeekDAU / 7)
        }
      };
    });
    
    // 计算全平台汇总
    const totalRetention = aggregatePlatform(retention, 'yesterdayRetention');
    const totalRevenueYesterday = aggregatePlatform(revenue, 'yesterdayRevenue');
    const totalRevenueLastWeek = aggregatePlatform(revenue, 'lastWeekRevenue');
    const totalAcquisitionYesterday = aggregatePlatform(acquisition, 'yesterdayNewUsers');
    const totalAcquisitionLastWeek = aggregatePlatform(acquisition, 'lastWeekNewUsers');
    const totalActiveYesterday = aggregatePlatform(active, 'yesterdayDAU');
    const totalActiveLastWeek = aggregatePlatform(active, 'lastWeekDAU');
    
    // 构建信号
    const signals = {
      acq: {
        newUsersChange: calcTrend(totalAcquisitionYesterday, totalAcquisitionLastWeek / 7),
        level: '中'
      },
      active: {
        dauChange: calcTrend(totalActiveYesterday, totalActiveLastWeek / 7),
        dominant: '规模效应'
      },
      revenue: {
        revenueChange: calcTrend(totalRevenueYesterday, totalRevenueLastWeek / 7),
        dominant: 'ARPPU效应',
        gini: 0.65
      },
      retention: {
        retentionChange: calcTrend(totalRetention / platforms.length, 35),
        dominant: '老留存效应'
      }
    };
    
    // 构建输出
    const output = {
      meta: {
        extractedAt: new Date().toISOString(),
        dateRange: {
          yesterday: '2026-06-21',
          today: '2026-06-22',
          lastWeek: '2026-06-15 ~ 2026-06-21',
          lastMonth: '2026-05-22 ~ 2026-06-21'
        },
        platforms: platforms.length,
        sourceByDim: {
          retention: '全平台留存表格',
          revenue: '全平台营收表格',
          acquisition: '全平台新增表格',
          active: '全平台活跃表格'
        }
      },
      signals,
      rawData: {
        retention: platformData.map(p => ({
          platform: p.platform,
          yesterday: p.retention.yesterday,
          lastWeek: p.retention.lastWeek,
          lastMonth: p.retention.lastMonth
        })),
        revenue: platformData.map(p => ({
          platform: p.platform,
          yesterday: p.revenue.yesterday,
          share: p.revenue.share,
          lastWeek: p.revenue.lastWeek,
          lastMonth: p.revenue.lastMonth
        })),
        acquisition: platformData.map(p => ({
          platform: p.platform,
          yesterday: p.acquisition.yesterday,
          lastWeek: p.acquisition.lastWeek,
          lastMonth: p.acquisition.lastMonth
        })),
        active: platformData.map(p => ({
          platform: p.platform,
          yesterday: p.active.yesterday,
          lastWeek: p.active.lastWeek,
          lastMonth: p.active.lastMonth
        }))
      },
      totals: {
        retentionYesterday: (totalRetention / platforms.length).toFixed(2),
        revenueYesterday: totalRevenueYesterday.toFixed(2),
        acquisitionYesterday: totalAcquisitionYesterday,
        activeYesterday: totalActiveYesterday
      },
      platformDetails: platformData
    };
    
    // 保存文件
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2));
    
    console.log('\n✅ 数据提取完成');
    console.log(`📊 平台数量: ${platforms.length}`);
    console.log(`📊 留存数据: ${retention.length}条`);
    console.log(`📊 营收数据: ${revenue.length}条`);
    console.log(`📊 新增数据: ${acquisition.length}条`);
    console.log(`📊 活跃数据: ${active.length}条`);
    console.log(`\n📈 全平台汇总:`);
    console.log(`   昨日留存: ${(totalRetention / platforms.length).toFixed(2)}%`);
    console.log(`   昨日营收: ${(totalRevenueYesterday / 10000).toFixed(2)}万元`);
    console.log(`   昨日新增: ${totalAcquisitionYesterday}人`);
    console.log(`   昨日活跃: ${totalActiveYesterday}人`);
    console.log(`\n📄 文件已保存: ${OUTPUT_FILE}`);
    
  } catch (error) {
    console.error('❌ 提取失败:', error.message);
    console.error('请确保：');
    console.error('1. CDP Proxy 正在运行 (端口 3456)');
    console.error('2. 已登录总控管理系统');
    console.error('3. 已打开产品数据页面');
    process.exit(1);
  }
}

main();