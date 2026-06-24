#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(SKILL_DIR, 'report');

if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const logMean = (a, b) => {
  if (a <= 0 || b <= 0) return 0.0;
  if (Math.abs(a - b) < 1e-10) return a;
  return (a - b) / (Math.log(a) - Math.log(b));
};

function loadData() {
  const rawFile = path.join(SKILL_DIR, 'raw_data.json');
  if (!fs.existsSync(rawFile)) return null;
  return JSON.parse(fs.readFileSync(rawFile, 'utf-8'));
}

function mergeData(banKuai, shiYong) {
  const merged = [];
  const shiYongMap = {};
  (shiYong || []).forEach(s => { shiYongMap[s.date] = s.avgDuration; });
  (banKuai || []).forEach(b => {
    const renJunShiChang = shiYongMap[b.date];
    if (renJunShiChang) {
      merged.push({
        date: b.date,
        dau: b.dau,
        jinFang: b.jinFang,
        renJunShiChang: renJunShiChang,
        totalShiChang: b.jinFang * renJunShiChang
      });
    }
  });
  return merged.sort((a, b) => a.date < b.date ? -1 : 1);
}

function lmdiDecompose(merged) {
  if (merged.length < 2) return null;
  const periodA = merged[0];
  const periodB = merged[merged.length - 1];
  const T0 = periodA.totalShiChang;
  const T1 = periodB.totalShiChang;
  const L = logMean(T0, T1);
  const deltaT = T1 - T0;
  const deltaPct = (T1 - T0) / T0 * 100;
  const guiMoEffect = L * Math.log(periodB.jinFang / periodA.jinFang);
  const guiMoPct = Math.abs(guiMoEffect / deltaT * 100);
  const qiangDuEffect = L * Math.log(periodB.renJunShiChang / periodA.renJunShiChang);
  const qiangDuPct = Math.abs(qiangDuEffect / deltaT * 100);
  return { periodA, periodB, decomposition: { deltaT, deltaPct, guiMoEffect, guiMoPct, qiangDuEffect, qiangDuPct }, dailyData: merged };
}

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
.metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 18px; margin-bottom: 24px; }
.metric-card { background: linear-gradient(135deg, #0C6B5A 0%, #094f43 100%); color: white; padding: 24px; border-radius: 14px; box-shadow: 0 6px 20px rgba(12,107,90,0.4); }
.metric-card.highlight { background: linear-gradient(135deg, #BC7314 0%, #9A5A10 100%); box-shadow: 0 6px 20px rgba(188,115,20,0.4); }
.metric-card .label { font-size: 12px; opacity: 0.9; margin-bottom: 6px; }
.metric-card .value { font-size: 32px; font-weight: 800; }
.metric-card .change { font-size: 13px; margin-top: 10px; font-weight: 600; }
.metric-card .change.up { color: #90EE90; }
.metric-card .change.down { color: #FFB6C1; }
.metric-card .change.neutral { color: #FFF; opacity: 0.8; }
.metric-card .change.highlight { color: #FFD700; font-weight: 700; }
.insight-box { background: #f8f9fb; border-radius: 12px; padding: 24px; border-left: 4px solid #0C6B5A; }
.insight-box.intensity { border-left-color: #BC7314; }
.insight-box.scale { border-left-color: #0C6B5A; }
.insight-box h3 { margin-bottom: 12px; color: #333; font-size: 18px; }
.insight-box p { font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 8px; }
.insight-box .hint { margin-top: 16px; padding-top: 12px; border-top: 1px solid #e8eef5; color: #666; font-size: 13px; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
th, td { padding: 14px 10px; text-align: left; border-bottom: 1px solid #e8eef5; }
th { background: linear-gradient(135deg, #f8f9fb 0%, #e8eef5 100%); font-weight: 700; color: #555; font-size: 11px; text-transform: uppercase; }
tr:hover { background: #f8f9fb; }
.chart-box { background: #f8f9fb; border-radius: 12px; padding: 24px; margin: 20px 0; }
.bar-svg { width: 100%; max-width: 400px; margin: 0 auto; }
.legend { text-align: center; margin-top: 16px; }
.legend-item { display: inline-block; margin: 0 16px; font-size: 13px; color: #666; font-weight: 600; }
.legend-item.scale { color: #0C6B5A; }
.legend-item.intensity { color: #BC7314; }
.action-box { background: #f8f9fb; border-radius: 12px; padding: 24px; border-left: 4px solid #0C6B5A; }
.action-box.intensity { border-left-color: #BC7314; }
.action-box h3 { margin-bottom: 16px; color: #333; font-size: 18px; }
.action-box p { font-size: 14px; color: #555; margin-bottom: 12px; }
.action-box ul { margin-left: 18px; color: #555; font-size: 14px; }
.action-box li { margin: 8px 0; line-height: 1.6; }
.action-box ul ul { margin-left: 18px; margin-top: 6px; }
.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; }
.kpi-card { background: #f8f9fb; border: 2px solid #e8eef5; border-radius: 12px; padding: 20px; text-align: center; }
.kpi-label { font-size: 13px; color: #666; margin-bottom: 12px; font-weight: 600; }
.kpi-value { font-size: 36px; font-weight: 800; color: #0C6B5A; margin-bottom: 8px; font-family: monospace; }
.kpi-target { font-size: 12px; color: #999; margin-bottom: 8px; }
.kpi-delta { font-size: 14px; font-weight: 600; padding: 4px 12px; border-radius: 12px; display: inline-block; }
.kpi-delta.pos { background: #E8F5E9; color: #0C6B5A; }
.kpi-delta.neg { background: #FFE5E5; color: #AE3E2D; }
.kpi-level { font-size: 12px; font-weight: 600; padding: 6px 14px; border-radius: 12px; display: inline-block; margin-top: 8px; }
.kpi-level.pos { background: #E8F5E9; color: #0C6B5A; }
.kpi-level.neg { background: #FFE5E5; color: #AE3E2D; }
.kpi-level.neutral { background: #FFF9E6; color: #BC7314; }
.footer { text-align: center; padding: 24px; color: rgba(255,255,255,0.8); font-size: 13px; margin-top: 30px; }
  `;
}

function generateHTML(results) {
  const { periodA, periodB, decomposition, dailyData } = results;
  const dominantFactor = decomposition.qiangDuPct > decomposition.guiMoPct ? 'intensity' : 'scale';
  
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>VV渠道活跃度LMDI-I分解报告</title>
<style>${getStyles()}</style>
</head>
<body>
<div class="container">
<header class="header">
<h1>VV渠道活跃度LMDI-I分解报告</h1>
<div class="meta">数据期间：${periodA.date} ~ ${periodB.date} | 生成时间：${new Date().toLocaleString('zh-CN')} | 模型：LMDI-I（两因子分解）</div>
<div class="version-badge">v5.0</div>
</header>

<div class="tabs">
<button class="tab active" onclick="showTab('overview')">概览</button>
<button class="tab" onclick="showTab('data')">数据表</button>
<button class="tab" onclick="showTab('chart')">分解图</button>
<button class="tab" onclick="showTab('action')">行动方案</button>
<button class="tab" onclick="showTab('kpi')">KPI看板</button>
</div>

<div id="overview" class="tab-content active">
<div class="metrics-grid">
<div class="metric-card"><div class="label">总时长变化</div><div class="value">${decomposition.deltaPct >= 0 ? '+' : ''}${decomposition.deltaPct.toFixed(2)}%</div><div class="change ${decomposition.deltaT >= 0 ? 'up' : 'down'}">${decomposition.deltaT >= 0 ? '↑' : '↓'} ${(decomposition.deltaT / 60).toFixed(0)}小时</div></div>
<div class="metric-card ${dominantFactor === 'scale' ? 'highlight' : ''}"><div class="label">规模效应（进房）</div><div class="value">${decomposition.guiMoPct.toFixed(1)}%</div><div class="change neutral">贡献占比</div></div>
<div class="metric-card ${dominantFactor === 'intensity' ? 'highlight' : ''}"><div class="label">强度效应（人均）</div><div class="value">${decomposition.qiangDuPct.toFixed(1)}%</div><div class="change highlight">${dominantFactor === 'intensity' ? '主导因素' : '贡献占比'}</div></div>
<div class="metric-card"><div class="label">进房人数变化</div><div class="value">${((periodB.jinFang / periodA.jinFang - 1) * 100).toFixed(2)}%</div><div class="change ${periodB.jinFang >= periodA.jinFang ? 'up' : 'down'}">${periodB.jinFang >= periodA.jinFang ? '↑' : '↓'} ${periodB.jinFang - periodA.jinFang}人</div></div>
</div>

<div class="card">
<h2>核心洞察</h2>
<div class="insight-box ${dominantFactor}">
${dominantFactor === 'intensity' ? 
  `<h3>强度效应主导 - 存量价值提升</h3><p>总时长增加的主要原因是<strong>人均时长提升</strong>（贡献${decomposition.qiangDuPct.toFixed(1)}%）</p><p>人均时长从${periodA.renJunShiChang.toFixed(2)}分钟增至${periodB.renJunShiChang.toFixed(2)}分钟（+${((periodB.renJunShiChang / periodA.renJunShiChang - 1) * 100).toFixed(2)}%）</p><p class="hint">诊断：存量盘更稳，长期价值信号。建议维持内容更新节奏，把稳住存量的做法机制化。</p>` :
  `<h3>规模效应主导 - 流量扩充</h3><p>总时长增加的主要原因是<strong>进房人数增加</strong>（贡献${decomposition.guiMoPct.toFixed(1)}%）</p><p>进房人数从${periodA.jinFang.toLocaleString()}增至${periodB.jinFang.toLocaleString()}（+${((periodB.jinFang / periodA.jinFang - 1) * 100).toFixed(2)}%）</p><p class="hint">诊断：新流量质量需关注，防留存稀释。建议加强新用户引导，优化首日体验。</p>`
}
</div>
</div>
</div>

<div id="data" class="tab-content">
<div class="card">
<h2>每日数据</h2>
<table>
<thead><tr><th>日期</th><th>DAU</th><th>进房人数</th><th>人均时长(分钟)</th><th>总时长(小时)</th></tr></thead>
<tbody>
${dailyData.map(d => `<tr><td>${d.date}</td><td>${d.dau.toLocaleString()}</td><td>${d.jinFang.toLocaleString()}</td><td>${d.renJunShiChang.toFixed(2)}</td><td>${(d.totalShiChang / 60).toFixed(0)}</td></tr>`).join('')}
</tbody>
</table>
</div>
</div>

<div id="chart" class="tab-content">
<div class="card">
<h2>LMDI分解贡献对比</h2>
<div class="chart-box">
<svg viewBox="0 0 400 280" class="bar-svg">
<rect x="80" y="${200 - decomposition.guiMoPct * 1.5}" width="100" height="${decomposition.guiMoPct * 1.5}" fill="#0C6B5A" rx="4"/>
<text x="130" y="240" text-anchor="middle" font-size="13" fill="#666">规模效应</text>
<text x="130" y="${200 - decomposition.guiMoPct * 1.5 - 10}" text-anchor="middle" font-size="16" fill="#0C6B5A" font-weight="700">${decomposition.guiMoPct.toFixed(1)}%</text>
<rect x="220" y="${200 - decomposition.qiangDuPct * 1.5}" width="100" height="${decomposition.qiangDuPct * 1.5}" fill="#BC7314" rx="4"/>
<text x="270" y="240" text-anchor="middle" font-size="13" fill="#666">强度效应</text>
<text x="270" y="${200 - decomposition.qiangDuPct * 1.5 - 10}" text-anchor="middle" font-size="16" fill="#BC7314" font-weight="700">${decomposition.qiangDuPct.toFixed(1)}%</text>
${dominantFactor === 'intensity' ? `<text x="270" y="260" text-anchor="middle" font-size="11" fill="#BC7314">★ 主导</text>` : `<text x="130" y="260" text-anchor="middle" font-size="11" fill="#0C6B5A">★ 主导</text>`}
</svg>
</div>
<div class="legend">
<span class="legend-item scale">规模效应（进房人数）: ${decomposition.guiMoPct.toFixed(1)}%</span>
<span class="legend-item intensity">强度效应（人均时长）: ${decomposition.qiangDuPct.toFixed(1)}%</span>
</div>
</div>
</div>

<div id="action" class="tab-content">
<div class="card">
<h2>诊断→行动映射</h2>
<div class="action-box ${dominantFactor}">
${dominantFactor === 'intensity' ? `
<h3>强度效应主导 → 存量运营策略</h3>
<p><strong>诊断结论：</strong>总时长增加主要来自人均时长提升，存量用户价值提升</p>
<ul>
<li><strong>P0 - 内容质量优化（内容组，D1-D7）</strong><ul><li>Top内容分析：识别高停留内容类型</li><li>内容推荐算法优化：提升内容匹配精准度</li><li>内容更新节奏：维持稳定更新频率</li></ul></li>
<li><strong>P1 - 用户粘性提升（产品组，D2-D7）</strong><ul><li>社交功能强化：增加互动引导</li><li>活动设计：设计长期留存活动</li><li>个性化推荐：基于用户偏好优化</li></ul></li>
<li><strong>横向支撑（数据组，D1-D7）</strong><ul><li>人均时长监控看板</li><li>内容效果A/B测试</li><li>周末复盘会议</li></ul></li>
</ul>
` : `
<h3>规模效应主导 → 新流量运营策略</h3>
<p><strong>诊断结论：</strong>总时长增加主要来自进房人数增加，新流量质量需关注</p>
<ul>
<li><strong>P0 - 新用户引导优化（产品组，D1-D7）</strong><ul><li>新人引导流程优化：降低首日流失</li><li>首充礼包A/B测试：提升首日付费</li><li>新手任务设计：引导核心功能使用</li></ul></li>
<li><strong>P1 - 拉新渠道优化（市场组，D2-D7）</strong><ul><li>渠道质量评估：识别高质量渠道</li><li>投放策略调整：聚焦高留存渠道</li><li>素材优化：提升点击率和转化率</li></ul></li>
<li><strong>横向支撑（数据组，D1-D7）</strong><ul><li>进房人数监控看板</li><li>渠道质量分析报告</li><li>周末复盘会议</li></ul></li>
</ul>
`}
</div>
</div>
</div>

<div id="kpi" class="tab-content">
<div class="card">
<h2>核心KPI看板</h2>
<div class="kpi-grid">
<div class="kpi-card"><div class="kpi-label">总时长（本期）</div><div class="kpi-value">${(periodB.totalShiChang / 60).toFixed(0)}小时</div><div class="kpi-target">目标：维持或增长</div><div class="kpi-delta ${decomposition.deltaT >= 0 ? 'pos' : 'neg'}">${decomposition.deltaT >= 0 ? '↑' : '↓'} ${Math.abs(decomposition.deltaPct).toFixed(2)}%</div></div>
<div class="kpi-card"><div class="kpi-label">进房人数（本期）</div><div class="kpi-value">${periodB.jinFang.toLocaleString()}</div><div class="kpi-target">目标：维持或增长</div><div class="kpi-delta ${periodB.jinFang >= periodA.jinFang ? 'pos' : 'neg'}">${periodB.jinFang >= periodA.jinFang ? '↑' : '↓'} ${Math.abs((periodB.jinFang / periodA.jinFang - 1) * 100).toFixed(2)}%</div></div>
<div class="kpi-card"><div class="kpi-label">人均时长（本期）</div><div class="kpi-value">${periodB.renJunShiChang.toFixed(2)}分钟</div><div class="kpi-target">目标：>140分钟</div><div class="kpi-delta ${periodB.renJunShiChang >= periodA.renJunShiChang ? 'pos' : 'neg'}">${periodB.renJunShiChang >= periodA.renJunShiChang ? '↑' : '↓'} ${Math.abs((periodB.renJunShiChang / periodA.renJunShiChang - 1) * 100).toFixed(2)}%</div></div>
<div class="kpi-card"><div class="kpi-label">DAU（本期）</div><div class="kpi-value">${periodB.dau.toLocaleString()}</div><div class="kpi-target">目标：维持或增长</div><div class="kpi-delta ${periodB.dau >= periodA.dau ? 'pos' : 'neg'}">${periodB.dau >= periodA.dau ? '↑' : '↓'} ${Math.abs((periodB.dau / periodA.dau - 1) * 100).toFixed(2)}%</div></div>
<div class="kpi-card"><div class="kpi-label">主导因素</div><div class="kpi-value">${dominantFactor === 'intensity' ? '强度效应' : '规模效应'}</div><div class="kpi-target">诊断结果</div><div class="kpi-level ${dominantFactor === 'intensity' ? 'pos' : 'neutral'}">${dominantFactor === 'intensity' ? '存量提升' : '流量扩充'}</div></div>
<div class="kpi-card"><div class="kpi-label">健康度评估</div><div class="kpi-value">${decomposition.deltaPct >= 0 ? '良好' : '需关注'}</div><div class="kpi-target">综合判断</div><div class="kpi-level ${decomposition.deltaPct >= 0 ? 'pos' : 'neg'}">${decomposition.deltaPct >= 0 ? '总时长增长' : '总时长下滑'}</div></div>
</div>
</div>
</div>

<footer class="footer">
<p>Powered by OpenClaw vv-active-decomposition | LMDI-I模型 | 数据来源：产品数据页面-活跃分类</p>
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

async function main() {
  const data = loadData();
  if (!data) { console.log('No data found'); process.exit(1); }
  
  const merged = mergeData(data.banKuaiData, data.shiYongData);
  if (merged.length < 2) { console.log('Insufficient data'); process.exit(1); }
  
  const results = lmdiDecompose(merged);
  if (!results) { console.log('LMDI calculation failed'); process.exit(1); }
  
  const html = generateHTML(results);
  const htmlFile = path.join(OUTPUT_DIR, 'index.html');
  fs.writeFileSync(htmlFile, html);
  
  const jsonFile = path.join(SKILL_DIR, 'vv_active_decomposition_results.json');
  fs.writeFileSync(jsonFile, JSON.stringify({ meta: { stamp: new Date().toISOString(), source: 'vv/active', period: `${results.periodA.date} ~ ${results.periodB.date}` }, ...results }, null, 2));
  
  console.log('========================================');
  console.log('VV Active Decomposition Report Generated');
  console.log('========================================');
  console.log('Period: ' + results.periodA.date + ' vs ' + results.periodB.date);
  console.log('Total Duration Change: ' + (results.decomposition.deltaPct >= 0 ? '+' : '') + results.decomposition.deltaPct.toFixed(2) + '%');
  console.log('Scale Effect: ' + results.decomposition.guiMoPct.toFixed(1) + '%');
  console.log('Intensity Effect: ' + results.decomposition.qiangDuPct.toFixed(1) + '%');
  console.log('Dominant Factor: ' + (results.decomposition.qiangDuPct > results.decomposition.guiMoPct ? 'Intensity' : 'Scale'));
  console.log('');
  console.log('HTML: ' + htmlFile);
  console.log('JSON: ' + jsonFile);
  console.log('========================================');
}

main();
