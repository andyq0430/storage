#!/usr/bin/env node

/**
 * VV渠道活跃度LMDI-I分解模型 - HTML报告版 v5.3
 * 数据新鲜度检查 + 自动触发浏览器提取
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(SKILL_DIR, 'report');
const RAW_DATA_FILE = path.join(SKILL_DIR, 'raw_data.json');

// 解析命令行参数
const args = process.argv.slice(2);
const verbose = args.includes('--verbose');
const forceMode = args.includes('--force');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('VV渠道活跃度LMDI-I分解模型 v5.3');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// ============================================================
// 步骤1：数据新鲜度检查
// ============================================================
console.log('📅 步骤1：数据新鲜度检查');
console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

function checkDataFreshness() {
  if (!fs.existsSync(RAW_DATA_FILE)) {
    return { fresh: false, reason: 'raw_data.json 不存在', maxDate: null };
  }
  
  const rawData = JSON.parse(fs.readFileSync(RAW_DATA_FILE, 'utf-8'));
  
  // 检查 banKuaiData 或 banKuai 数组
  const banKuai = rawData.banKuaiData || rawData.banKuai || [];
  if (banKuai.length === 0) {
    return { fresh: false, reason: '板块活跃数据为空', maxDate: null };
  }
  
  // 获取最新日期
  const dates = banKuai
    .map(d => d.date)
    .filter(d => d && /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort()
    .reverse();
  
  if (dates.length === 0) {
    return { fresh: false, reason: '无有效日期数据', maxDate: null };
  }
  
  const maxDate = dates[0];
  
  // 计算日期差
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const maxDateObj = new Date(maxDate + 'T00:00:00');
  const diffDays = Math.floor((today - maxDateObj) / (1000 * 60 * 60 * 24));
  
  // 判断新鲜度（超过1天视为过期）
  const isFresh = diffDays <= 1;
  
  return {
    fresh: isFresh,
    reason: isFresh ? '数据新鲜' : `数据已过期${diffDays}天`,
    maxDate,
    diffDays,
    dayCount: banKuai.length
  };
}

const freshness = checkDataFreshness();
const todayStr = new Date().toISOString().slice(0, 10);

console.log(`📅 当前日期: ${todayStr}`);
console.log(`📊 数据最新日期: ${freshness.maxDate || '无数据'}`);

if (freshness.fresh) {
  console.log('✅ 数据新鲜度: OK');
  console.log(`   数据天数: ${freshness.dayCount}`);
} else {
  console.log(`❌ 数据新鲜度: 过期 (${freshness.reason})`);
}

// 强制模式检查
if (!freshness.fresh && !forceMode) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('⚠️  数据已过期，需要提取最新数据');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n返回码: 10 (触发浏览器提取)');
  console.log('\n如需强制使用过期数据，请使用 --force 参数');
  process.exit(10);
}

if (forceMode && !freshness.fresh) {
  console.log('⚠️  强制模式：使用过期数据继续执行');
}

console.log('');

// 确保输出目录
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// LMDI-I 对数平均函数
const logMean = (a, b) => {
  if (a <= 0 || b <= 0) return 0.0;
  if (Math.abs(a - b) < 1e-10) return a;
  return (a - b) / (Math.log(a) - Math.log(b));
};

// 从JSON文件读取提取的数据
function loadExtractedData() {
  const rawContent = fs.readFileSync(RAW_DATA_FILE, 'utf-8');
  const data = JSON.parse(rawContent);
  
  // 适配不同的数据结构
  return {
    banKuai: data.banKuaiData || data.banKuai || [],
    shiYong: data.shiYongData || data.shiYong || []
  };
}

// 合并板块活跃和使用时长数据
function mergeData(banKuai, shiYong) {
  const merged = [];
  const shiYongMap = {};
  
  (shiYong || []).forEach(s => {
    shiYongMap[s.date] = s;
  });
  
  (banKuai || []).forEach(b => {
    const s = shiYongMap[b.date];
    if (s) {
      merged.push({
        date: b.date,
        dau: b.dau,
        jinFang: b.jinFang,
        renJunShiChang: s.avgDuration || (s.ios + s.android) / 2
      });
    }
  });
  
  return merged.sort((a, b) => a.date < b.date ? -1 : 1);
}

// LMDI-I分解
function lmdiDecompose(T0, T1) {
  if (T0 <= 0 || T1 <= 0) return null;
  
  const L = logMean(T0, T1);
  const ratio = T1 / T0;
  const logRatio = Math.log(ratio);
  
  return {
    L: L,
    ratio: ratio,
    logRatio: logRatio,
    deltaT: T1 - T0,
    deltaPct: ((T1 - T0) / T0 * 100)
  };
}

// 主函数
async function main() {
  const data = loadExtractedData();
  
  console.log('📈 步骤2：加载数据');
  console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const merged = mergeData(data.banKuai, data.shiYong);
  
  if (merged.length < 2) {
    console.log('❌ 数据不足，至少需要2天数据');
    process.exit(1);
  }
  
  console.log('✅ 数据加载成功');
  console.log(`   数据期间: ${merged[0].date} ~ ${merged[merged.length-1].date}`);
  console.log(`   数据天数: ${merged.length}`);
  
  console.log('\n📊 步骤3：LMDI-I分解计算');
  console.log('   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  // 使用第一期和最后一期对比
  const periodA = merged[0];
  const periodB = merged[merged.length - 1];
  
  // 计算总时长
  const T0 = periodA.jinFang * periodA.renJunShiChang;
  const T1 = periodB.jinFang * periodB.renJunShiChang;
  
  // LMDI分解
  const lmdi = lmdiDecompose(T0, T1);
  
  if (!lmdi) {
    console.log('❌ LMDI计算失败');
    process.exit(1);
  }
  
  // 计算规模效应和强度效应
  const guiMoEffect = lmdi.L * Math.log(periodB.jinFang / periodA.jinFang);
  const qiangDuEffect = lmdi.L * Math.log(periodB.renJunShiChang / periodA.renJunShiChang);
  
  // 计算占比
  const guiMoPct = Math.abs(guiMoEffect / lmdi.deltaT * 100);
  const qiangDuPct = Math.abs(qiangDuEffect / lmdi.deltaT * 100);
  
  // 生成结果对象
  const results = {
    meta: {
      stamp: new Date().toISOString(),
      source: 'vv/活跃',
      period: `${periodA.date} ~ ${periodB.date}`
    },
    periodA: {
      date: periodA.date,
      dau: periodA.dau,
      jinFang: periodA.jinFang,
      renJunShiChang: periodA.renJunShiChang,
      totalShiChang: T0
    },
    periodB: {
      date: periodB.date,
      dau: periodB.dau,
      jinFang: periodB.jinFang,
      renJunShiChang: periodB.renJunShiChang,
      totalShiChang: T1
    },
    decomposition: {
      deltaT: lmdi.deltaT,
      deltaPct: lmdi.deltaPct,
      guiMoEffect: guiMoEffect,
      guiMoPct: guiMoPct,
      qiangDuEffect: qiangDuEffect,
      qiangDuPct: qiangDuPct
    },
    dailyData: merged
  };
  
  // 保存JSON结果
  const jsonFile = path.join(SKILL_DIR, 'vv_active_decomposition_results.json');
  fs.writeFileSync(jsonFile, JSON.stringify(results, null, 2));
  
  // 生成HTML报告
  const html = generateHTML(results);
  const htmlFile = path.join(OUTPUT_DIR, 'index.html');
  fs.writeFileSync(htmlFile, html);
  
  console.log('   ✅ HTML报告已生成: ' + htmlFile);
  
  // 输出摘要
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ 活跃度分解分析完成！');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log('输出文件：');
  console.log('  • raw_data.json                        - 原始数据');
  console.log('  • vv_active_decomposition_results.json  - 分析结果');
  console.log('  • report/index.html                    - HTML报告\n');
  
  console.log('诊断结果：');
  console.log(`  • 数据期间: ${results.periodA.date} ~ ${results.periodB.date}`);
  console.log(`  • 总时长变化: ${results.decomposition.deltaPct >= 0 ? '+' : ''}${results.decomposition.deltaPct.toFixed(2)}%`);
  console.log(`  • 规模效应(进房): ${results.decomposition.guiMoPct.toFixed(1)}%`);
  console.log(`  • 强度效应(人均): ${results.decomposition.qiangDuPct.toFixed(1)}%`);
  console.log(`  • 主导因素: ${results.decomposition.qiangDuPct > results.decomposition.guiMoPct ? '强度效应(人均时长)' : '规模效应(进房人数)'}`);
  
  process.exit(0);
}

// 生成HTML报告
function generateHTML(results) {
  const { meta, periodA, periodB, decomposition, dailyData } = results;
  
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VV渠道活跃度LMDI-I分解报告</title>
<style>
${getStyles()}
</style>
</head>
<body>
<div class="container">
<header class="header">
<h1>VV渠道活跃度LMDI-I分解报告</h1>
<div class="meta">数据期间：${meta.period} | 生成时间：${new Date().toLocaleString('zh-CN')}</div>
<div class="version-badge">v5.3</div>
</header>

<div class="tabs">
<button class="tab active" onclick="showTab('overview')">概览</button>
<button class="tab" onclick="showTab('decompose')">分解结果</button>
<button class="tab" onclick="showTab('data')">数据表</button>
<button class="tab" onclick="showTab('chart')">图表</button>
</div>

<div id="overview" class="tab-content active">
<div class="metrics-grid">
<div class="metric-card"><div class="label">总时长变化</div><div class="value">${decomposition.deltaPct >= 0 ? '+' : ''}${decomposition.deltaPct.toFixed(2)}%</div><div class="change ${decomposition.deltaT >= 0 ? 'up' : 'down'}">${decomposition.deltaT >= 0 ? '+' : ''}${(decomposition.deltaT / 60).toFixed(0)}小时</div></div>
<div class="metric-card"><div class="label">规模效应(进房)</div><div class="value">${decomposition.guiMoPct.toFixed(1)}%</div><div class="change neutral">贡献占比</div></div>
<div class="metric-card ${decomposition.qiangDuPct > decomposition.guiMoPct ? 'highlight' : ''}"><div class="label">强度效应(人均)</div><div class="value">${decomposition.qiangDuPct.toFixed(1)}%</div><div class="change ${decomposition.qiangDuPct > decomposition.guiMoPct ? 'highlight' : 'neutral'}">主导因素</div></div>
<div class="metric-card"><div class="label">进房人数变化</div><div class="value">${((periodB.jinFang / periodA.jinFang - 1) * 100).toFixed(2)}%</div><div class="change ${periodB.jinFang >= periodA.jinFang ? 'up' : 'down'}">${periodB.jinFang >= periodA.jinFang ? '+' : ''}${periodB.jinFang - periodA.jinFang}</div></div>
</div>

<div class="card">
<h2>核心发现</h2>
<div class="insight-box ${decomposition.qiangDuPct > decomposition.guiMoPct ? 'intensity' : 'scale'}">
${decomposition.qiangDuPct > decomposition.guiMoPct ? 
  '<h3>强度效应主导</h3><p>总时长变化主要原因是<strong>人均时长变化</strong>（贡献' + decomposition.qiangDuPct.toFixed(1) + '%）</p><p>人均时长从' + periodA.renJunShiChang.toFixed(2) + '分钟变为' + periodB.renJunShiChang.toFixed(2) + '分钟</p>' :
  '<h3>规模效应主导</h3><p>总时长变化主要原因是<strong>进房人数变化</strong>（贡献' + decomposition.guiMoPct.toFixed(1) + '%）</p><p>进房人数从' + periodA.jinFang.toLocaleString() + '变为' + periodB.jinFang.toLocaleString() + '</p>'
}
</div>
</div>
</div>

<div id="decompose" class="tab-content">
<div class="card">
<h2>LMDI-I分解结果</h2>
<table>
<thead><tr><th>指标</th><th>上期(${periodA.date})</th><th>本期(${periodB.date})</th><th>变化</th></tr></thead>
<tbody>
<tr><td>进房人数</td><td>${periodA.jinFang.toLocaleString()}</td><td>${periodB.jinFang.toLocaleString()}</td><td class="${periodB.jinFang >= periodA.jinFang ? 'pos' : 'neg'}">${periodB.jinFang >= periodA.jinFang ? '+' : ''}${periodB.jinFang - periodA.jinFang}</td></tr>
<tr><td>人均时长(分钟)</td><td>${periodA.renJunShiChang.toFixed(2)}</td><td>${periodB.renJunShiChang.toFixed(2)}</td><td class="${periodB.renJunShiChang >= periodA.renJunShiChang ? 'pos' : 'neg'}">${periodB.renJunShiChang >= periodA.renJunShiChang ? '+' : ''}${(periodB.renJunShiChang - periodA.renJunShiChang).toFixed(2)}</td></tr>
<tr><td>总时长(分钟)</td><td>${periodA.totalShiChang.toLocaleString()}</td><td>${periodB.totalShiChang.toLocaleString()}</td><td class="${decomposition.deltaT >= 0 ? 'pos' : 'neg'}">${decomposition.deltaT >= 0 ? '+' : ''}${decomposition.deltaT.toLocaleString()}</td></tr>
</tbody>
</table>

<h3>分解贡献</h3>
<div class="decomposition-grid">
<div class="dec-item"><div class="dec-label">总时长变化</div><div class="dec-value">${decomposition.deltaT >= 0 ? '+' : ''}${(decomposition.deltaT / 60).toFixed(0)}小时</div><div class="dec-pct">${decomposition.deltaPct >= 0 ? '+' : ''}${decomposition.deltaPct.toFixed(2)}%</div></div>
<div class="dec-item"><div class="dec-label">规模效应(进房)</div><div class="dec-value">${decomposition.guiMoEffect >= 0 ? '+' : ''}${(decomposition.guiMoEffect / 60).toFixed(0)}小时</div><div class="dec-pct">${decomposition.guiMoPct.toFixed(1)}%</div></div>
<div class="dec-item ${decomposition.qiangDuPct > decomposition.guiMoPct ? 'highlight' : ''}"><div class="dec-label">强度效应(人均)</div><div class="dec-value">${decomposition.qiangDuEffect >= 0 ? '+' : ''}${(decomposition.qiangDuEffect / 60).toFixed(0)}小时</div><div class="dec-pct ${decomposition.qiangDuPct > decomposition.guiMoPct ? 'highlight' : ''}">${decomposition.qiangDuPct.toFixed(1)}%</div></div>
</div>
</div>
</div>

<div id="data" class="tab-content">
<div class="card">
<h2>每日数据</h2>
<table>
<thead><tr><th>日期</th><th>DAU</th><th>进房人数</th><th>人均时长(分钟)</th><th>总时长(小时)</th></tr></thead>
<tbody>
${dailyData.map(d => '<tr><td>' + d.date + '</td><td>' + d.dau.toLocaleString() + '</td><td>' + d.jinFang.toLocaleString() + '</td><td>' + d.renJunShiChang.toFixed(2) + '</td><td>' + (d.jinFang * d.renJunShiChang / 60).toFixed(0) + '</td></tr>').join('')}
</tbody>
</table>
</div>
</div>

<div id="chart" class="tab-content">
<div class="card">
<h2>分解贡献对比图</h2>
<div class="chart-box">
<svg viewBox="0 0 400 250" class="pie-svg">
${generatePieSVG(decomposition.guiMoPct, decomposition.qiangDuPct)}
</svg>
</div>
<div class="legend">
<span class="legend-item scale">规模效应: ${decomposition.guiMoPct.toFixed(1)}%</span>
<span class="legend-item intensity">强度效应: ${decomposition.qiangDuPct.toFixed(1)}%</span>
</div>
</div>
</div>

<footer class="footer">
<p>Powered by OpenClaw vv-active-decomposition v5.3 | LMDI-I模型 | 数据新鲜度检查</p>
</footer>
</div>

<script>
function showTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  document.getElementById(tabId).classList.add('active');
  event.target.classList.add('active');
}
</script>
</body>
</html>`;
}

// 生成饼图SVG
function generatePieSVG(scalePct, intensityPct) {
  const scaleHeight = scalePct * 1.5;
  const intensityHeight = intensityPct * 1.5;
  
  return `
<rect x="50" y="${200 - scaleHeight}" width="120" height="${scaleHeight}" fill="#0C6B5A" rx="4"/>
<text x="110" y="230" text-anchor="middle" font-size="12" fill="#666">规模效应</text>
<text x="110" y="${200 - scaleHeight - 10}" text-anchor="middle" font-size="14" fill="#0C6B5A" font-weight="700">${scalePct.toFixed(1)}%</text>

<rect x="230" y="${200 - intensityHeight}" width="120" height="${intensityHeight}" fill="#BC7314" rx="4"/>
<text x="290" y="230" text-anchor="middle" font-size="12" fill="#666">强度效应</text>
<text x="290" y="${200 - intensityHeight - 10}" text-anchor="middle" font-size="14" fill="#BC7314" font-weight="700">${intensityPct.toFixed(1)}%</text>
`;
}

// 获取样式
function getStyles() {
  return `
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif; background: linear-gradient(135deg, #0C6B5A 0%, #094f43 100%); color: #333; min-height: 100vh; padding: 20px; }
.container { max-width: 1400px; margin: 0 auto; }
.header { background: white; color: #333; padding: 40px; border-radius: 20px; margin-bottom: 24px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); position: relative; }
.header h1 { font-size: 36px; margin-bottom: 12px; background: linear-gradient(135deg, #0C6B5A 0%, #094f43 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; font-weight: 800; }
.header .meta { color: #666; font-size: 14px; }
.version-badge { position: absolute; top: 20px; right: 20px; background: #E3F2FD; color: #2C6CAE; padding: 6px 14px; border-radius: 12px; font-size: 12px; font-weight: 700; border: 2px solid #90CAF9; }
.tabs { display: flex; gap: 8px; margin-bottom: 24px; flex-wrap: wrap; }
.tab { padding: 14px 24px; background: rgba(255,255,255,0.9); border: none; cursor: pointer; font-size: 14px; color: #666; border-radius: 10px; transition: all 0.3s; font-weight: 600; }
.tab:hover { transform: translateY(-2px); background: white; }
.tab.active { background: white; color: #0C6B5A; box-shadow: 0 4px 16px rgba(12,107,90,0.3); }
.tab-content { display: none; }
.tab-content.active { display: block; animation: fadeIn 0.3s ease; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.card { background: white; border-radius: 16px; padding: 28px; margin-bottom: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
.card h2 { font-size: 20px; margin-bottom: 20px; color: #333; border-left: 5px solid #0C6B5A; padding-left: 14px; }
.card h3 { font-size: 16px; margin: 24px 0 14px; color: #555; }
.metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 18px; margin-bottom: 24px; }
.metric-card { background: linear-gradient(135deg, #0C6B5A 0%, #094f43 100%); color: white; padding: 24px; border-radius: 14px; box-shadow: 0 6px 20px rgba(12,107,90,0.4); }
.metric-card.highlight { background: linear-gradient(135deg, #BC7314 0%, #9A5A10 100%); box-shadow: 0 6px 20px rgba(188,115,20,0.4); }
.metric-card .label { font-size: 12px; opacity: 0.9; margin-bottom: 6px; }
.metric-card .value { font-size: 32px; font-weight: 800; }
.metric-card .change { font-size: 13px; margin-top: 10px; font-weight: 600; }
.metric-card .change.up { color: #90EE90; }
.metric-card .change.down { color: #FFB6C1; }
.metric-card .change.highlight { color: #FFD700; }
.metric-card .change.neutral { color: #FFF; opacity: 0.8; }
.insight-box { background: #f8f9fb; border-radius: 12px; padding: 24px; border-left: 4px solid #0C6B5A; }
.insight-box.intensity { border-left-color: #BC7314; }
.insight-box.scale { border-left-color: #0C6B5A; }
.insight-box h3 { margin-bottom: 12px; color: #333; }
.insight-box p { font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 8px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 14px 10px; text-align: left; border-bottom: 1px solid #e8eef5; }
th { background: linear-gradient(135deg, #f8f9fb 0%, #e8eef5 100%); font-weight: 700; color: #555; font-size: 11px; text-transform: uppercase; }
tr:hover { background: #f8f9fb; }
.pos { color: #0C6B5A; font-weight: 600; }
.neg { color: #AE3E2D; font-weight: 600; }
.decomposition-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 20px; }
.dec-item { background: #f8f9fb; padding: 20px; border-radius: 10px; text-align: center; }
.dec-item.highlight { border: 2px solid #BC7314; }
.dec-label { font-size: 12px; color: #666; margin-bottom: 8px; }
.dec-value { font-size: 22px; font-weight: 700; font-family: monospace; color: #333; }
.dec-pct { font-size: 14px; color: #999; margin-top: 4px; }
.dec-pct.highlight { color: #BC7314; font-weight: 700; }
.chart-box { background: #f8f9fb; border-radius: 12px; padding: 24px; margin: 20px 0; }
.pie-svg { width: 100%; max-width: 400px; margin: 0 auto; }
.legend { text-align: center; margin-top: 16px; }
.legend-item { display: inline-block; margin: 0 16px; font-size: 13px; color: #666; font-weight: 600; }
.legend-item.scale { color: #0C6B5A; }
.legend-item.intensity { color: #BC7314; }
.footer { text-align: center; padding: 24px; color: rgba(255,255,255,0.8); font-size: 13px; margin-top: 30px; }
  `;
}

// 执行
main();
