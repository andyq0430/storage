#!/usr/bin/env node
/**
 * 用户留存诊断HTML报告生成器
 */

import fs from 'fs';
import path from 'path';

// 读取数据
const rawData = fs.readFileSync(path.join(path.dirname(import.meta.url.replace('file:///', '')), '..', 'raw_data.json'), 'utf-8');
const parsed = JSON.parse(rawData);
const data = parsed.days || parsed; // 支持两种格式

// 读取模板
const templatePath = path.join(path.dirname(import.meta.url.replace('file:///', '')), 'template.html');
const template = fs.readFileSync(templatePath, 'utf-8');

// 工具函数
function num(v) { return parseFloat(v) || 0; }
function r1(x) { return (Math.round(x * 10) / 10).toFixed(1); }
function sgn1(x) { return (x >= 0 ? '+' : '−') + (Math.abs(Math.round(x * 10) / 10)).toFixed(1); }
function intc(x) { return Math.round(x).toLocaleString('en-US'); }
function esc(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

function activeUsers(d) {
  return num(d.newUsers) + num(d.oldUsers);
}

function newRatio(d) {
  const a = activeUsers(d);
  return a > 0 ? num(d.newUsers) / a : 0;
}

function activeRetention(d) {
  const wn = newRatio(d);
  const rn = num(d.newRetain1);
  const ro = num(d.oldRetain1);
  return wn * rn + (1 - wn) * ro;
}

function decompose(A, B) {
  const wnA = newRatio(A), wnB = newRatio(B);
  const woA = 1 - wnA, woB = 1 - wnB;
  const rnA = num(A.newRetain1), rnB = num(B.newRetain1);
  const roA = num(A.oldRetain1), roB = num(B.oldRetain1);
  
  return {
    mix: (wnB - wnA) * ((rnA + rnB) / 2) + (woB - woA) * ((roA + roB) / 2),
    newR: ((wnA + wnB) / 2) * (rnB - rnA),
    oldR: ((woA + woB) / 2) * (roB - roA),
    raA: activeRetention(A),
    raB: activeRetention(B)
  };
}

function dominant(D) {
  const arr = [['结构', D.mix], ['新留存', D.newR], ['老留存', D.oldR]];
  arr.sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
  const k = arr[0][0], v = arr[0][1];
  const col = k === '结构' ? 'var(--active)' : (k === '新留存' ? 'var(--newc)' : 'var(--oldc)');
  const label = k === '结构' ? (v < 0 ? '结构稀释' : '结构优化') : (k + (v < 0 ? '恶化' : '改善'));
  return { key: k, val: v, label, col };
}

// Playbook
const playbook = {
  '结构': {
    ws: '控结构·优化配比',
    color: 'var(--active)',
    恶化: {
      title: '优先:控结构 · 优化新老配比',
      acts: ['不要急着改产品/onboarding——结构稀释说明产品没坏', '管获客节奏:避免脉冲式放量把低留存新用户灌进来', '给渠道设留存质量门槛,低留存来源反馈到投放'],
      watch: '新用户占比、各渠道新留存、结构效应'
    },
    改善: {
      title: '结构在帮你 · 留意是否只是获客放缓',
      acts: ['确认是高留存来源占比上升,还是获客放缓副作用', '固化高留存来源,纳入获客组合', '别因结构好看而放松对新/老自身留存的监控'],
      watch: '新用户占比、获客量趋势'
    }
  },
  '新留存': {
    ws: '提升新用户留存',
    color: 'var(--newc)',
    恶化: {
      title: '优先:提升新用户留存',
      acts: ['查近期 onboarding / 激活路径改动,定位变差环节', '排查新进渠道质量(是否买进低意愿用户)', '优化首日体验:aha 前置、缩短激活路径'],
      watch: 'D1/D7 新留存、激活率、新留存效应'
    },
    改善: {
      title: '新留存改善 · 固化有效动作',
      acts: ['把见效的激活/引导固化进默认新手流程', '复制到其他入口/渠道', '持续 A/B 守住增量'],
      watch: 'D7 新留存、激活率'
    }
  },
  '老留存': {
    ws: '守住老用户留存',
    color: 'var(--oldc)',
    恶化: {
      title: '优先:守住老用户留存',
      acts: ['存量流失最危险:建活跃度下降预警 + 定向召回', '排查产品体验衰减、核心功能改动、内容陈旧', '看竞品挤压与用户疲劳信号'],
      watch: 'D7/D30 老留存、核心功能使用率、老留存效应'
    },
    改善: {
      title: '存量盘更稳 · 长期价值信号',
      acts: ['维持内容/版本更新节奏,保住核心循环新鲜度', '把稳住存量的做法机制化', '资源更多挪向新用户与配比问题'],
      watch: 'D30 老留存、复访频次'
    }
  }
};

// 计算分解
const D = data.length >= 2 ? decompose(data[0], data[data.length - 1]) : null;
const rec = D ? {
  dom: dominant(D),
  dir: D.raB >= D.raA ? '改善' : '恶化',
  A: data[0],
  B: data[data.length - 1]
} : null;

// 每日数据
const dailyRows = data.map(d => `<tr>
  <td>${esc(d.date)}</td>
  <td class="comp hi">${intc(num(d.newUsers))}</td>
  <td class="comp">${intc(num(d.oldUsers))}</td>
  <td class="comp">${r1(num(d.newRetain1))}%</td>
  <td class="comp">${r1(num(d.oldRetain1))}%</td>
  <td class="comp">${intc(activeUsers(d))}</td>
  <td class="comp hi">${r1(activeRetention(d))}%</td>
</tr>`).join('\n');

// 关键指标
const last = data[data.length - 1] || {};
const prev = data.length > 1 ? data[data.length - 2] : null;
const dlt = prev ? activeRetention(last) - activeRetention(prev) : 0;
const dom = rec ? rec.dom : null;
const gap = num(last.oldRetain1) - num(last.newRetain1);

const cards = `
  <div class="card"><div class="lbl">最新活跃留存</div><span class="num">${r1(activeRetention(last))}%</span></div>
  <div class="card"><div class="lbl">较前一日</div><span class="num ${dlt >= 0 ? 'up' : 'down'}">${sgn1(dlt)}pt</span></div>
  <div class="card"><div class="lbl">最近主导</div>${dom ? `<span class="pill" style="background:color-mix(in srgb,${dom.col} 16%,transparent);color:${dom.col}">${dom.label}</span>` : '<span class="num">—</span>'}</div>
  <div class="card"><div class="lbl">老−新留存差</div><span class="num ${gap >= 0 ? 'up' : 'down'}">${sgn1(gap)}pt</span></div>
`;

// 诊断建议
let playHtml = '<p class="hint">至少需要两天数据后给出建议。</p>';
if (rec) {
  const pb = playbook[rec.dom.key];
  const node = pb[rec.dir];
  playHtml = `<div class="play" style="border-left-color:${pb.color}">
    <div class="ws"><span class="dot" style="background:${pb.color}"></span>${pb.ws} · ${rec.A.date}→${rec.B.date} 主导 ${rec.dom.label}</div>
    <h3>${esc(node.title)}</h3>
    <ul>${node.acts.map(a => `<li>${esc(a)}</li>`).join('')}</ul>
    <div class="watch"><b>盯的指标:</b>${esc(node.watch)}</div>
  </div>`;
}

// 甘特图
const tasks = [
  { ws: '控结构·优化配比', name: '留存日报加结构拆分', s: 1, e: 2 },
  { ws: '控结构·优化配比', name: '获客节奏与渠道留存门槛', s: 2, e: 5 },
  { ws: '控结构·优化配比', name: '新老分群运营与预警', s: 3, e: 6 },
  { ws: '提升新用户留存', name: '激活路径/aha诊断', s: 1, e: 3 },
  { ws: '提升新用户留存', name: 'onboarding重构', s: 3, e: 6 },
  { ws: '提升新用户留存', name: '新手7日旅程', s: 4, e: 8 },
  { ws: '守住老用户留存', name: '流失预警+定向召回', s: 1, e: 4 },
  { ws: '守住老用户留存', name: '核心循环新鲜度', s: 3, e: 7 },
  { ws: '横向', name: 'cohort留存矩阵周复盘', s: 1, e: 8 }
];

const wsColors = {
  '控结构·优化配比': 'var(--active)',
  '提升新用户留存': 'var(--newc)',
  '守住老用户留存': 'var(--oldc)',
  '横向': 'var(--cross)'
};

const ganttRows = tasks.map(t => {
  const wsColor = wsColors[t.ws];
  const isRec = rec && t.ws.includes(playbook[rec.dom.key]?.ws);
  const gantt = [1,2,3,4,5,6,7,8].map(w => 
    `<td class="gcell"><div class="gblk" style="background:${w >= t.s && w <= t.e ? wsColor : ''}"></div></td>`
  ).join('');
  return `<tr style="${isRec ? 'background:color-mix(in srgb,'+wsColor+' 9%,transparent)' : ''}">
    <td style="text-align:left">${isRec ? '<span style="color:var(--warn)">★ </span>' : ''}${t.ws}</td>
    <td style="text-align:left">${t.name}</td>
    <td>—</td>
    <td class="comp">${t.s}</td>
    <td class="comp">${t.e}</td>
    <td class="comp">未开始</td>
    <td class="comp">0%</td>
    ${gantt}
  </tr>`;
}).join('\n');

// KPI
const kpiRows = [
  ['活跃用户留存率 %', r1(activeRetention(last)), '守住并回升'],
  ['D7 新用户留存 %', r1(num(last.newRetain1)), '↑(缩小与老的差)'],
  ['D7 老用户留存 %', r1(num(last.oldRetain1)), '守住'],
  ['新用户占比 %', r1(newRatio(last)*100), '配比稳定,避免脉冲稀释'],
  ['结构效应(pt/日)', '监控', '异常即预警'],
  ['质量效应(pt/日)', '监控', '转正/稳定']
].map(r => `<tr><td>${r[0]}</td><td class="comp hi">${r[1]}</td><td style="text-align:left;color:var(--muted)">${r[2]}</td></tr>`).join('\n');

// 分解结论
const concl = D ? `<div class="banner" style="background:color-mix(in srgb,${rec.dom.col} 12%,transparent)">
  <b>${esc(data[0].date)} → ${esc(data[data.length-1].date)}</b>: 活跃留存 ${sgn1(D.raB - D.raA)}pt (${r1(D.raA)}% → ${r1(D.raB)}%)
  | 结构 ${sgn1(D.mix)} / 新留存 ${sgn1(D.newR)} / 老留存 ${sgn1(D.oldR)} pt
  | 主导 <b style="color:${rec.dom.col}">${rec.dom.label}</b>
</div>` : '';

// 组装HTML
const html = template
  .replace('id="daily"></tbody>', `id="daily">${dailyRows}</tbody>`)
  .replace('id="cards"></div>', `id="cards">${cards}</div>`)
  .replace('id="concl" style="margin-top:12px"></div>', `id="concl" style="margin-top:12px">${concl}</div>`)
  .replace('id="playAuto"></div>', `id="playAuto">${playHtml}</div>`)
  .replace('id="gantt"></tbody>', `id="gantt">${ganttRows}</tbody>`)
  .replace('id="kpi"></tbody>', `id="kpi">${kpiRows}</tbody>`);

// 写入报告
const reportPath = path.join(path.dirname(import.meta.url.replace('file:///', '')), '..', 'report.html');
fs.writeFileSync(reportPath, html, 'utf-8');

console.log('✅ HTML报告已生成: ' + reportPath);
