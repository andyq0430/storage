#!/usr/bin/env node
/**
 * retention-diagnosis 完整执行脚本 v4.0
 * 
 * 功能：
 * 1. LMDI-I分解分析
 * 2. 瀑布图可视化
 * 3. 甘特图行动计划
 * 4. 实施方案生成
 * 5. 数据质量检查
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_DIR = path.resolve(__dirname, '..');
const DATA_FILE = path.join(SKILL_DIR, 'raw_data.json');
const OUTPUT_DIR = path.join(SKILL_DIR, 'report');

// 确保输出目录
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// ============================================================================
// 核心计算函数
// ============================================================================

function num(v) { return parseFloat(v) || 0; }
function r1(x) { return (Math.round(x * 10) / 10).toFixed(1); }
function sgn1(x) { return (x >= 0 ? '+' : '−') + (Math.abs(Math.round(x * 10) / 10)).toFixed(1); }
function intc(x) { return Math.round(x).toLocaleString('en-US'); }

function activeUsers(d) {
  return num(d.newU || d.newUsers || 0) + num(d.oldU || d.oldUsers || 0);
}

function newRatio(d) {
  const a = activeUsers(d);
  return a > 0 ? num(d.newU || d.newUsers || 0) / a : 0;
}

function activeRetention(d) {
  const wn = newRatio(d);
  const rn = num(d.nR || d.newRetain1 || 0);
  const ro = num(d.oR || d.oldRetain1 || 0);
  return wn * rn + (1 - wn) * ro;
}

/**
 * LMDI-I分解
 */
function decompose(A, B) {
  const wnA = newRatio(A), wnB = newRatio(B);
  const woA = 1 - wnA, woB = 1 - wnB;
  const rnA = num(A.nR || A.newRetain1 || 0);
  const rnB = num(B.nR || B.newRetain1 || 0);
  const roA = num(A.oR || A.oldRetain1 || 0);
  const roB = num(B.oR || B.oldRetain1 || 0);
  
  const raA = activeRetention(A);
  const raB = activeRetention(B);
  
  const mix = (wnB - wnA) * ((rnA + rnB) / 2 - (roA + roB) / 2);
  const newR = ((wnA + wnB) / 2) * (rnB - rnA);
  const oldR = ((woA + woB) / 2) * (roB - roA);
  const dRa = raB - raA;
  
  return { raA, raB, dRa, mix, newR, oldR };
}

/**
 * 找出主导因素
 */
function dominant(D) {
  const absMix = Math.abs(D.mix);
  const absNewR = Math.abs(D.newR);
  const absOldR = Math.abs(D.oldR);
  
  const max = Math.max(absMix, absNewR, absOldR);
  
  if (max === absMix) {
    return { key: '结构', val: D.mix, label: '结构效应主导', abs: absMix };
  } else if (max === absNewR) {
    return { key: '新留存', val: D.newR, label: '新留存效应主导', abs: absNewR };
  } else {
    return { key: '老留存', val: D.oldR, label: '老留存效应主导', abs: absOldR };
  }
}

// ============================================================================
// 可视化函数
// ============================================================================

/**
 * 生成瀑布图SVG
 */
function generateWaterfall(steps) {
  const W = 720, H = 240;
  const ml = 10, mr = 10, mt = 22, base = 190;
  
  let run = 0;
  const bars = steps.map(s => {
    let b;
    if (s.abs) {
      b = { bv: 0, tv: s.val };
      run = s.val;
    } else {
      const a = run;
      const e = run + s.val;
      run = e;
      b = { bv: Math.min(a, e), tv: Math.max(a, e) };
    }
    return Object.assign({}, s, b);
  });
  
  const maxV = Math.max(...bars.map(b => b.tv).concat([1]));
  const scale = (base - mt) / maxV;
  
  function Y(v) {
    return base - v * scale;
  }
  
  const inner = W - ml - mr;
  const n = bars.length;
  const slot = inner / n;
  
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" font-family="var(--sans)">`;
  
  svg += `<line x1="${ml}" y1="${base}" x2="${W - mr}" y2="${base}" stroke="var(--line2)" stroke-width="1"/>`;
  
  let runv = 0;
  bars.forEach((b, i) => {
    const cx = ml + slot * (i + 0.5);
    const bw = Math.min(slot * 0.5, 70);
    const x = cx - bw / 2;
    
    const col = b.abs ? 'var(--faint)' : (b.val >= 0 ? 'var(--pos)' : 'var(--neg)');
    const h = Math.max((b.tv - b.bv) * scale, 2);
    
    svg += `<rect x="${x.toFixed(1)}" y="${Y(b.tv).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${col}" opacity="0.9"/>`;
    
    const lab = b.abs ? (r1(b.val) + '%') : sgn1(b.val);
    svg += `<text x="${cx.toFixed(1)}" y="${(Y(b.tv) - 7).toFixed(1)}" text-anchor="middle" font-size="12" font-weight="600" fill="var(--ink)">${lab}</text>`;
    svg += `<text x="${cx.toFixed(1)}" y="${base + 18}" text-anchor="middle" font-size="12" fill="var(--muted)">${b.label}</text>`;
    
    const after = b.abs ? b.tv : runv + b.val;
    runv = after;
    
    if (i < bars.length - 1) {
      const ny = Y(after).toFixed(1);
      svg += `<line x1="${(cx + bw / 2).toFixed(1)}" y1="${ny}" x2="${(ml + slot * (i + 1.5) - bw / 2).toFixed(1)}" y2="${ny}" stroke="var(--line2)" stroke-width="1" stroke-dasharray="3 3"/>`;
    }
  });
  
  svg += '</svg>';
  return svg;
}

/**
 * 生成甘特图HTML
 */
function generateGanttChart(priorityColor) {
  const tasks = [
    { name: '控结构·优化配比', items: ['留存日报加结构拆分', '获客节奏与渠道留存门槛', '新老分群运营与预警'], color: 'green', start: 0, duration: 6 },
    { name: '提升新用户留存', items: ['激活路径/aha诊断', 'onboarding重构', '新手7日旅程'], color: 'orange', start: 1, duration: 7 },
    { name: '守住老用户留存', items: ['流失预警+定向召回', '核心循环新鲜度'], color: 'blue', start: 1, duration: 6 },
    { name: '横向支撑', items: ['cohort留存矩阵周复盘'], color: 'gray', start: 0, duration: 8 }
  ];
  
  const priorityTask = tasks.find(t => t.color === priorityColor);
  if (priorityTask) {
    priorityTask.priority = true;
  }
  
  let html = '<div class="gantt">';
  
  tasks.forEach(task => {
    const priorityMark = task.priority ? '<span class="gantt-priority">★</span> ' : '';
    html += `
      <div class="gantt-row">
        <div class="gantt-task">${priorityMark}${task.name}</div>
        <div class="gantt-lane">
          <div class="gantt-bar ${task.color}" style="left: ${(task.start / 8) * 100}%; width: ${(task.duration / 8) * 100}%">W${task.start + 1}-W${task.start + task.duration}</div>
        </div>
        <div class="gantt-status">进行中</div>
      </div>`;
    
    task.items.forEach((item, i) => {
      html += `
        <div class="gantt-row">
          <div style="padding-left: 20px; color: #666; font-size: 12px;">• ${item}</div>
          <div class="gantt-lane">
            <div class="gantt-bar ${task.color}" style="left: ${((task.start + i * 0.5) / 8) * 100}%; width: ${Math.min(25, (task.duration / 8) * 100)}%; opacity: 0.7"></div>
          </div>
          <div class="gantt-status" style="font-size: 10px; color: #999">待启动</div>
        </div>`;
    });
  });
  
  html += '</div>';
  return html;
}

/**
 * 生成结论文本
 */
function generateConclusion(A, B, D) {
  const dom = dominant(D);
  const dir = D.dRa >= 0 ? '上升' : '下降';
  
  const head = `<b>${A.date} → ${B.date}</b>: 活跃留存 ${sgn1(D.dRa)}pt (${r1(D.raA)}% → ${r1(D.raB)}%)。结构 ${sgn1(D.mix)} / 新留存 ${sgn1(D.newR)} / 老留存 ${sgn1(D.oldR)} pt。`;
  
  let body;
  
  if (dom.key === '结构') {
    body = dom.val < 0
      ? '主因是<b class="tag-in">结构稀释</b>: 低留存的新用户占比上升（多半是获客放量），把活跃留存拉了下来，而新、老两段自身留存基本没恶化。此时不要急着改产品/onboarding——先确认这波放量的用户 LTV 是否仍为正，或给渠道设留存门槛。'
      : '主因是<b>结构优化</b>: 高留存的老用户占比上升带动活跃留存走高。注意这可能只是获客放缓的副作用，不等于产品变好。';
  } else if (dom.key === '新留存') {
    body = dom.val < 0
      ? '主因是<b class="tag-in">新用户留存恶化</b>: 不是占比问题，是新用户本身留得更差了。重点查近期 onboarding/激活改动、新进渠道质量、或产品对新人的首日体验。'
      : '主因是<b>新用户留存改善</b>: 新人首期体验在变好，onboarding 或渠道质量的优化见效了。';
  } else {
    body = dom.val < 0
      ? '主因是<b class="tag-out">老用户留存恶化</b>: 存量用户在加速流失，通常更危险。排查产品体验衰减、核心功能改动、竞品挤压或用户疲劳。'
      : '主因是<b>老用户留存改善</b>: 存量盘更稳了，长期价值的信号。';
  }
  
  return head + '<div style="margin-top:8px">' + body + '</div>';
}

/**
 * 生成行动计划
 */
function generateActionPlan(D) {
  const dom = dominant(D);
  
  let priorityColor = 'gray';
  let actions = [];
  
  if (dom.key === '结构') {
    if (dom.val < 0) {
      priorityColor = 'green';
      actions = [
        { priority: 'P0', action: '留存日报加结构拆分', watch: '新用户占比、新老留存差', timeline: '本周内' },
        { priority: 'P0', action: '给渠道设留存门槛', watch: '新用户LTV_D1 ≥ 目标值', timeline: '本周内' },
        { priority: 'P1', action: '新老分群运营', watch: '新用户D1留存', timeline: '2周内' }
      ];
    } else {
      actions = [
        { priority: 'P1', action: '确认是否为获客放缓导致', watch: '新增用户数趋势', timeline: '本周内' }
      ];
    }
  } else if (dom.key === '新留存') {
    if (dom.val < 0) {
      priorityColor = 'orange';
      actions = [
        { priority: 'P0', action: '新用户激活路径诊断', watch: '首日关键行为转化', timeline: '本周内' },
        { priority: 'P0', action: '检查近期onboarding改动', watch: '新用户D1留存', timeline: '本周内' },
        { priority: 'P1', action: '新进渠道质量分析', watch: '分渠道D1留存', timeline: '2周内' },
        { priority: 'P1', action: '新手引导重构', watch: '新用户7日留存', timeline: '4周内' }
      ];
    } else {
      actions = [
        { priority: 'P1', action: '复盘近期优化措施', watch: '新用户留存稳定性', timeline: '本周内' }
      ];
    }
  } else {
    if (dom.val < 0) {
      priorityColor = 'blue';
      actions = [
        { priority: 'P0', action: '流失预警+定向召回', watch: '老用户流失率', timeline: '本周内' },
        { priority: 'P0', action: '排查产品体验衰减', watch: '老用户活跃度', timeline: '本周内' },
        { priority: 'P1', action: '核心循环新鲜度优化', watch: '老用户时长', timeline: '2周内' }
      ];
    } else {
      actions = [
        { priority: 'P1', action: '总结老用户运营经验', watch: '老用户留存稳定性', timeline: '本周内' }
      ];
    }
  }
  
  return { priorityColor, actions };
}

// ============================================================================
// HTML报告生成
// ============================================================================

function generateHTML(data, D, A, B, actionPlan) {
  const waterfallSteps = [
    { label: '基准', abs: true, val: D.raA },
    { label: '结构', val: D.mix },
    { label: '新留存', val: D.newR },
    { label: '老留存', val: D.oldR },
    { label: '对比', abs: true, val: D.raB }
  ];
  
  const waterfallSVG = generateWaterfall(waterfallSteps);
  const ganttChart = generateGanttChart(actionPlan.priorityColor);
  
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>留存诊断报告 - ${data.meta?.dateRange?.end || '最新'}</title>
<style>
 :root{
 --bg:#FBFAF7;--surface:#FFFFFF;--ink:#1A1A18;--muted:#6B6A64;--faint:#9C9A92;
 --line:#E7E3D8;--line2:#D8D3C5;
 --active:#0F6E56;--newc:#C2410C;--oldc:#1E5F8C;--cross:#5F5E5A;
 --pos:#2F7D32;--neg:#B3261E;--warn:#B45309;
 --posbg:#EAF3E4;--negbg:#FBEAE8;--warnbg:#FBF0DD;--infobg:#E9F1F8;
 --radius:10px;--mono:ui-monospace,"SF Mono",Menlo,Consolas,monospace;
 --sans:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
 }
 @media(prefers-color-scheme:dark){:root{
 --bg:#1A1A17;--surface:#232320;--ink:#ECEAE2;--muted:#A8A69C;--faint:#76746C;
 --line:#34332E;--line2:#403F38;--active:#5DCAA5;--newc:#F0997B;--oldc:#85B7EB;--cross:#B4B2A9;
 --pos:#9BD17F;--neg:#F09595;--warn:#EAB861;
 --posbg:#1E2A1A;--negbg:#2E1A18;--warnbg:#2C2410;--infobg:#15222E;}}
 *{box-sizing:border-box}
 body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);line-height:1.55;-webkit-font-smoothing:antialiased;}
 .wrap{max-width:980px;margin:0 auto;padding:30px 22px 80px;}
 header{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap;border-bottom:1px solid var(--line2);padding-bottom:16px;}
 .eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--faint);margin:0 0 6px;}
 h1{font-size:24px;font-weight:600;margin:0;letter-spacing:-.01em;}
 section{margin-top:24px;}
 h2{font-size:13px;letter-spacing:.05em;text-transform:uppercase;color:var(--muted);font-weight:600;margin:20px 0 12px;}
 .tbwrap{overflow-x:auto;border:1px solid var(--line);border-radius:var(--radius);background:var(--surface);}
 table{width:100%;border-collapse:collapse;font-size:13px;}
 th,td{padding:8px 9px;border-bottom:1px solid var(--line);white-space:nowrap;}
 th{color:var(--muted);font-weight:600;font-size:12px;text-align:right;} th:first-child{text-align:left;}
 td{text-align:right;} td:first-child{text-align:left;}
 .comp{font-family:var(--mono);color:var(--muted);} .comp.hi{color:var(--active);font-weight:600;}
 .up{color:var(--pos);} .down{color:var(--neg);}
 .card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:13px 15px;}
 .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;}
 .card .lbl{font-size:12px;color:var(--muted);margin-bottom:6px;}
 .card .num{font-size:22px;font-weight:600;font-family:var(--mono);}
 .pill{display:inline-block;font-size:13px;font-weight:600;padding:4px 11px;border-radius:7px;}
 .chartbox{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:14px 12px 10px;}
 .legend{display:flex;gap:16px;flex-wrap:wrap;font-size:12.5px;color:var(--muted);padding:0 4px 12px;}
 .legend span{display:inline-flex;align-items:center;gap:6px;} .sw{width:14px;height:3px;border-radius:2px;}
 .play{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:18px 20px;border-left:4px solid var(--active);margin:16px 0;}
 .play .ws{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px;}
 .play h3{margin:0 0 6px;font-size:17px;font-weight:600;}
 .play ul{margin:8px 0 0;padding-left:18px;} .play li{margin:5px 0;font-size:14px;line-height:1.6;}
 .play .watch{margin-top:12px;font-size:13px;color:var(--muted);}
 .banner{border-radius:var(--radius);padding:13px 16px;font-size:14px;margin-bottom:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
 .gantt { margin: 16px 0; }
 .gantt-row { display: grid; grid-template-columns: 200px 1fr 80px; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--line); align-items: center; }
 .gantt-task { font-weight: 600; }
 .gantt-lane { position: relative; height: 24px; background: repeating-linear-gradient(90deg, transparent, transparent calc(100%/8 - 1px), var(--line) calc(100%/8 - 1px), var(--line) calc(100%/8)); border-radius: 4px; }
 .gantt-bar { position: absolute; top: 3px; height: 18px; border-radius: 4px; display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; color: white; font-size: 10px; font-weight: 600; font-family: var(--mono); }
 .gantt-bar.green { background: #0C6B5A; }
 .gantt-bar.orange { background: #BC7314; }
 .gantt-bar.blue { background: #2C6CAE; }
 .gantt-bar.gray { background: #7B867F; }
 .gantt-status { font-size: 11px; color: var(--muted); }
 .gantt-priority { color: #AE3E2D; font-weight: 700; }
 .footer { text-align: center; padding: 24px; color: rgba(255,255,255,0.8); font-size: 13px; margin-top: 30px; background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); }
 .tag-in { color: var(--newc); }
 .tag-out { color: var(--oldc); }
</style>
</head>
<body>
<div class="wrap">

<header>
  <div>
    <div class="eyebrow">Retention Diagnosis</div>
    <h1>留存闭环:诊断 → 行动 → 跟踪</h1>
  </div>
  <div style="text-align:right;font-size:13px;color:var(--muted);">
    <div>${A.date} → ${B.date}</div>
    <div style="margin-top:4px;font-family:var(--mono);">${r1(D.dRa >= 0 ? '+' : '')}${r1(D.dRa)}pt 活跃留存变化</div>
  </div>
</header>

<section>
  <h2>核心指标变化</h2>
  <div class="cards">
    <div class="card">
      <div class="lbl">活跃留存</div>
      <div class="num">${r1(D.raA)}% → ${r1(D.raB)}%</div>
      <div class="${D.dRa >= 0 ? 'up' : 'down'}" style="font-size:13px;margin-top:6px;font-weight:600;">${sgn1(D.dRa)}pt</div>
    </div>
    <div class="card">
      <div class="lbl">新用户留存</div>
      <div class="num">${r1(num(A.nR || A.newRetain1 || 0))}% → ${r1(num(B.nR || B.newRetain1 || 0))}%</div>
    </div>
    <div class="card">
      <div class="lbl">老用户留存</div>
      <div class="num">${r1(num(A.oR || A.oldRetain1 || 0))}% → ${r1(num(B.oR || B.oldRetain1 || 0))}%</div>
    </div>
    <div class="card">
      <div class="lbl">新用户占比</div>
      <div class="num">${r1(newRatio(A) * 100)}% → ${r1(newRatio(B) * 100)}%</div>
    </div>
  </div>
</section>

<section>
  <h2>因素分解（LMDI-I）</h2>
  <div class="chartbox">
    ${waterfallSVG}
  </div>
  <div style="margin-top:16px;font-size:14px;line-height:1.7;">
    ${generateConclusion(A, B, D)}
  </div>
</section>

<section>
  <h2>行动计划</h2>
  ${actionPlan.actions.map(a => `
    <div class="play">
      <div class="ws">${a.priority} · ${a.timeline}</div>
      <h3>${a.action}</h3>
      <div class="watch">追踪: ${a.watch}</div>
    </div>
  `).join('')}
</section>

<section>
  <h2>实施甘特图（8周）</h2>
  ${ganttChart}
</section>

<section>
  <h2>近7日数据</h2>
  <div class="tbwrap">
    <table>
      <thead>
        <tr>
          <th>日期</th>
          <th>活跃留存</th>
          <th>新留存</th>
          <th>老留存</th>
          <th>新用户</th>
          <th>老用户</th>
        </tr>
      </thead>
      <tbody>
        ${data.days.slice(-7).reverse().map(d => `
          <tr>
            <td>${d.date}</td>
            <td class="comp ${activeRetention(d) > 50 ? 'hi' : ''}">${r1(activeRetention(d))}%</td>
            <td class="${num(d.nR || d.newRetain1) < 25 ? 'down' : ''}">${r1(num(d.nR || d.newRetain1 || 0))}%</td>
            <td>${r1(num(d.oR || d.oldRetain1 || 0))}%</td>
            <td class="comp">${intc(num(d.newU || d.newUsers || 0))}</td>
            <td class="comp">${intc(num(d.oldU || d.oldUsers || 0))}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
</section>

<div class="footer">
  留存诊断报告 | 生成时间：${new Date().toLocaleString('zh-CN')} | Retention Diagnosis v4.0
</div>

</div>
</body>
</html>`;
}

// ============================================================================
// 主函数
// ============================================================================

function runDiagnosis() {
  console.log('\n========================================');
  console.log('  Retention Diagnosis 留存诊断');
  console.log('  v4.0 - 完整版');
  console.log('========================================\n');
  
  if (!fs.existsSync(DATA_FILE)) {
    console.error('❌ 数据文件不存在:', DATA_FILE);
    console.log('请先提取数据或使用已有的 raw_data.json');
    process.exit(1);
  }
  
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  console.log('✓ 加载数据:', data.days?.length || 0, '天');
  
  if (!data.days || data.days.length < 2) {
    console.error('❌ 数据不足，至少需要2天数据');
    process.exit(1);
  }
  
  // 筛选最近有效数据
  const validDays = data.days.filter(d => d.aR > 0 || d.nR > 0 || d.oR > 0);
  console.log('✓ 有效数据:', validDays.length, '天');
  
  if (validDays.length < 2) {
    console.error('❌ 有效数据不足');
    process.exit(1);
  }
  
  // 选择首尾两天对比
  const A = validDays[0];
  const B = validDays[validDays.length - 1];
  
  console.log('\n📊 分析周期:');
  console.log('  首日:', A.date);
  console.log('  末日:', B.date);
  
  // LMDI-I分解
  const D = decompose(A, B);
  const dom = dominant(D);
  
  console.log('\n📈 核心指标变化:');
  console.log('  活跃留存:', r1(D.raA) + '%', '→', r1(D.raB) + '%', '(' + sgn1(D.dRa) + 'pt)');
  console.log('  新用户留存:', r1(num(A.nR || A.newRetain1 || 0)) + '%', '→', r1(num(B.nR || B.newRetain1 || 0)) + '%');
  console.log('  老用户留存:', r1(num(A.oR || A.oldRetain1 || 0)) + '%', '→', r1(num(B.oR || B.oldRetain1 || 0)) + '%');
  
  console.log('\n📉 LMDI-I分解:');
  console.log('  结构效应:', sgn1(D.mix), 'pt');
  console.log('  新留存效应:', sgn1(D.newR), 'pt');
  console.log('  老留存效应:', sgn1(D.oldR), 'pt');
  console.log('  主导因素:', dom.label);
  
  // 生成行动计划
  const actionPlan = generateActionPlan(D);
  
  console.log('\n📋 行动计划:');
  actionPlan.actions.forEach((a, i) => {
    console.log('  [' + a.priority + ']', a.action);
    console.log('      时间线:', a.timeline);
    console.log('      追踪:', a.watch);
  });
  
  // 生成HTML报告
  const html = generateHTML(data, D, A, B, actionPlan);
  const outputPath = path.join(OUTPUT_DIR, 'index.html');
  fs.writeFileSync(outputPath, html);
  
  console.log('\n✅ 报告已生成:', outputPath);
  console.log('========================================\n');
}

// 执行
runDiagnosis();
