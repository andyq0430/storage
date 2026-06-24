#!/usr/bin/env node
/**
 * gen-report.mjs — 把 results.json 渲染成自包含的交互式 HTML 报告
 *
 * 用法：
 *   node gen-report.mjs                         # 读 ./results.json → ./report.html
 *   node gen-report.mjs --in results.json --out report.html
 *
 * 报告含 5 个标签页：数据概览 / LTV分解 / 诊断→行动 / 6周甘特图 / KPI看板
 * 并在 <script id="ltv-results" type="application/json"> 内嵌完整结果，供 AI agent 回读。
 */

import fs from 'node:fs';

const args = process.argv.slice(2);
const getArg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const inFile = getArg('--in', 'results.json');
const outFile = getArg('--out', 'report.html');

const R = JSON.parse(fs.readFileSync(inFile, 'utf8'));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => n == null || n === '' ? '–' : (typeof n === 'number' ? n.toLocaleString() : esc(n));
const sign = (n) => n > 0 ? '+' : '';

const d = R.diagnosis, dec = R.decomposition, sum = R.summary;

// ---- 分解瀑布数据 ----
const wf = [];
let acc = dec.V0;
wf.push({ label: '上期 V0', val: dec.V0, base: 0, h: dec.V0, type: 'anchor' });
for (const f of dec.factors) {
  const start = acc; acc += f.add;
  wf.push({ label: f.name, val: f.add, base: Math.min(start, acc), h: Math.abs(f.add), type: f.add >= 0 ? 'up' : 'down' });
}
wf.push({ label: '本期 V1', val: dec.V1, base: 0, h: dec.V1, type: 'anchor' });
const wfMax = Math.max(...wf.map(b => b.base + b.h), 1);

const waterfallBars = wf.map(b => {
  const bottomPct = (b.base / wfMax * 100).toFixed(1);
  const hPct = (b.h / wfMax * 100).toFixed(1);
  const cls = b.type === 'anchor' ? 'wf-anchor' : (b.type === 'up' ? 'wf-up' : 'wf-down');
  const tag = b.type === 'anchor' ? fmt(b.val) : `${sign(b.val)}${fmt(b.val)}`;
  return `<div class="wf-col">
    <div class="wf-track">
      <div class="wf-bar ${cls}" style="bottom:${bottomPct}%;height:${hPct}%">
        <span class="wf-val">${tag}</span>
      </div>
    </div>
    <div class="wf-label">${esc(b.label)}</div>
  </div>`;
}).join('');

// ---- 分解表 ----
const decRows = dec.factors.map(f => `<tr>
  <td>${esc(f.name)}</td>
  <td class="num ${f.add >= 0 ? 'pos' : 'neg'}">${sign(f.add)}${fmt(f.add)}</td>
  <td class="num">${f.pct}%</td>
  <td class="num">×${f.mul}</td>
  <td><div class="minibar"><span class="${f.add >= 0 ? 'pos' : 'neg'}" style="width:${Math.min(Math.abs(f.pct), 100)}%"></span></div></td>
</tr>`).join('');

// ---- 原始数据表 ----
const dataRows = R.rows.map(r => `<tr>
  <td class="b">${esc(r.batch)}</td>
  <td class="num">${fmt(r.newUsers)}</td>
  <td class="num">${(r.payRateD0 * 100).toFixed(2)}%</td>
  <td class="num">${fmt(r.arppuD0)}</td>
  <td class="num">${fmt(r.ltvD0)}</td>
  <td class="num">${fmt(r.ltvD7)}</td>
  <td class="num">${fmt(r.ltvD30)}</td>
  <td class="num">${fmt(r.ltvD60)}</td>
  <td class="num">${r.recycleMult != null ? r.recycleMult + '×' : '–'}</td>
</tr>`).join('');

// ---- 行动方案卡 ----
const actionCard = (flow, color, title, actions, kpi, primary) => `
  <div class="action ${primary ? 'action-primary' : ''}" style="--flow:${color}">
    ${primary ? '<div class="badge">本期优先 ★</div>' : ''}
    <div class="action-flow">${esc(flow)}</div>
    <div class="action-title">${esc(title)}</div>
    <ul>${actions.map(a => `<li>${esc(a)}</li>`).join('')}</ul>
    <div class="action-kpi">盯的指标：${esc(kpi)}</div>
  </div>`;

let actionCards = actionCard(d.flow, d.primary && pbColor(d.dominantKey), d.primary.title, d.primary.actions, d.primary.kpi, true);
if (d.curve) actionCards += actionCard('🟣 拉曲线·促复购留存', '#8b5cf6', d.curve.title, d.curve.actions, d.curve.kpi, false);

function pbColor(key) { return { scale: '#2e9e6b', conversion: '#2f7fd4', arppu: '#e08a2e' }[key] || '#5b6370'; }

// ---- 甘特图 ----
const WEEKS = 6;
const flowColor = (flow) => flow.startsWith('🟢') ? '#2e9e6b' : flow.startsWith('🔵') ? '#2f7fd4' : flow.startsWith('🟠') ? '#e08a2e' : flow.startsWith('🟣') ? '#8b5cf6' : flow.startsWith('🟤') ? '#9a6a4a' : '#8a909c';
const ganttRows = R.gantt.map(g => {
  const cells = [];
  for (let wk = 1; wk <= WEEKS; wk++) {
    const on = wk >= g.s && wk <= g.e;
    cells.push(`<div class="gx ${on ? 'on' : ''}" style="--c:${flowColor(g.flow)}"></div>`);
  }
  return `<div class="grow ${g.star ? 'starred' : ''}">
    <div class="gflow" style="--c:${flowColor(g.flow)}">${g.star ? '★ ' : ''}${esc(g.flow)}</div>
    <div class="gtask">${esc(g.task)}</div>
    <div class="gbars">${cells.join('')}</div>
  </div>`;
}).join('');

// ---- KPI 看板 ----
const kpiRows = R.kpiBaseline.map(k => `<tr>
  <td>${esc(k.kpi)}</td>
  <td class="num b">${fmt(k.baseline)}</td>
  <td>${esc(k.target)}</td>
  <td><input class="kpi-in" placeholder="W1"></td>
  <td><input class="kpi-in" placeholder="W2"></td>
  <td><input class="kpi-in" placeholder="W3"></td>
  <td><input class="kpi-in" placeholder="W4"></td>
</tr>`).join('');

const dirArrow = d.direction === 'up' ? '↑' : '↓';
const dirClass = d.direction === 'up' ? 'pos' : 'neg';
const curveMap = { strong: ['回本强', 'pos'], normal: ['回本正常', 'mid'], weak: ['回本偏弱', 'neg'], unknown: ['数据不足', 'mid'] };
const [curveTxt, curveCls] = curveMap[d.curveHealth] || curveMap.unknown;

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VV渠道 · 新增用户 LTV 诊断与行动报告</title>
<style>
  :root{
    --ink:#16181d; --ink-2:#3a3f4a; --mut:#6b7280; --line:#e6e3da; --line-2:#d8d4c8;
    --paper:#f7f5ef; --card:#ffffff; --accent:#1a3a5c; --pos:#1f7a4d; --neg:#b3402b; --mid:#b07d24;
    --mono:"SFMono-Regular",ui-monospace,"DejaVu Sans Mono",Menlo,Consolas,monospace;
    --sans:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.55;-webkit-font-smoothing:antialiased}
  .wrap{max-width:1080px;margin:0 auto;padding:32px 24px 80px}
  .num{font-family:var(--mono);font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
  .pos{color:var(--pos)} .neg{color:var(--neg)} .mid{color:var(--mid)} .b{font-weight:650}

  header{border-bottom:2px solid var(--ink);padding-bottom:18px;margin-bottom:8px}
  .eyebrow{font-family:var(--mono);font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--mut)}
  h1{font-size:30px;line-height:1.15;margin:6px 0 4px;letter-spacing:-.01em}
  .sub{color:var(--ink-2);font-size:14px}
  .meta{font-family:var(--mono);font-size:11.5px;color:var(--mut);margin-top:6px}

  /* 顶部诊断结论条 */
  .verdict{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--accent);
    border-radius:4px;padding:18px 20px;margin:22px 0 26px;display:flex;flex-wrap:wrap;gap:22px;align-items:center}
  .verdict .vmain{flex:1;min-width:260px}
  .verdict .vk{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)}
  .verdict .vflow{font-size:19px;font-weight:680;margin-top:2px}
  .verdict .vdesc{color:var(--ink-2);font-size:13.5px;margin-top:3px}
  .vstats{display:flex;gap:26px}
  .vstat .n{font-family:var(--mono);font-size:22px;font-weight:600}
  .vstat .l{font-size:11px;color:var(--mut)}

  nav{display:flex;gap:2px;border-bottom:1px solid var(--line-2);margin-bottom:24px;flex-wrap:wrap}
  nav button{appearance:none;background:none;border:none;border-bottom:2px solid transparent;
    padding:9px 14px;font-family:var(--sans);font-size:13.5px;color:var(--mut);cursor:pointer;margin-bottom:-1px}
  nav button:hover{color:var(--ink)}
  nav button.active{color:var(--ink);border-bottom-color:var(--accent);font-weight:600}

  .panel{display:none;animation:fade .2s ease} .panel.active{display:block}
  @keyframes fade{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:none}}

  h2{font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--mut);font-family:var(--mono);
    margin:0 0 14px;font-weight:600}
  .card{background:var(--card);border:1px solid var(--line);border-radius:4px;padding:20px;margin-bottom:20px}

  table{width:100%;border-collapse:collapse;font-size:13.5px}
  th{text-align:right;font-family:var(--mono);font-size:11px;letter-spacing:.04em;text-transform:uppercase;
    color:var(--mut);font-weight:600;padding:7px 10px;border-bottom:1px solid var(--line-2)}
  th:first-child{text-align:left}
  td{padding:8px 10px;border-bottom:1px solid var(--line)}
  td:first-child{text-align:left}
  tbody tr:hover{background:#faf8f2}
  .minibar{height:7px;background:#eee9dd;border-radius:3px;overflow:hidden;min-width:90px}
  .minibar span{display:block;height:100%} .minibar .pos{background:var(--pos)} .minibar .neg{background:var(--neg)}

  /* 瀑布图 */
  .waterfall{display:flex;align-items:flex-end;gap:14px;height:280px;padding:10px 4px 0;margin-top:6px}
  .wf-col{flex:1;display:flex;flex-direction:column;align-items:center;height:100%}
  .wf-track{position:relative;width:100%;flex:1}
  .wf-bar{position:absolute;left:12%;right:12%;border-radius:3px;display:flex;justify-content:center}
  .wf-anchor{background:#34404e} .wf-up{background:var(--pos)} .wf-down{background:var(--neg)}
  .wf-val{font-family:var(--mono);font-size:10.5px;color:#fff;padding-top:3px;font-weight:600}
  .wf-label{font-size:11px;color:var(--ink-2);text-align:center;margin-top:7px;line-height:1.25}
  .deltabar{display:flex;justify-content:space-between;font-family:var(--mono);font-size:13px;
    padding:12px 4px 0;border-top:1px solid var(--line);margin-top:14px}

  /* 行动卡 */
  .actions{display:grid;gap:16px}
  .action{background:var(--card);border:1px solid var(--line);border-left:4px solid var(--flow);border-radius:4px;padding:18px 20px;position:relative}
  .action-primary{box-shadow:0 1px 0 var(--line),0 8px 24px -16px rgba(0,0,0,.3)}
  .badge{position:absolute;top:-1px;right:-1px;background:var(--flow);color:#fff;font-family:var(--mono);
    font-size:10px;letter-spacing:.08em;padding:3px 9px;border-radius:0 4px 0 8px}
  .action-flow{font-size:15px;font-weight:680;color:var(--flow)}
  .action-title{font-size:14px;color:var(--ink);margin:3px 0 10px;font-weight:600}
  .action ul{margin:0;padding-left:18px} .action li{margin:4px 0;font-size:13.5px;color:var(--ink-2)}
  .action-kpi{margin-top:12px;padding-top:10px;border-top:1px dashed var(--line-2);font-family:var(--mono);font-size:12px;color:var(--mut)}

  /* 甘特图 */
  .gantt-head{display:grid;grid-template-columns:190px 1fr 240px;gap:0;font-family:var(--mono);font-size:10.5px;
    color:var(--mut);text-transform:uppercase;letter-spacing:.06em;padding:0 0 8px;border-bottom:1px solid var(--line-2)}
  .gantt-head .wks{display:grid;grid-template-columns:repeat(6,1fr)}
  .gantt-head .wks span{text-align:center}
  .grow{display:grid;grid-template-columns:190px 1fr 240px;gap:0;align-items:center;padding:7px 0;border-bottom:1px solid var(--line)}
  .grow.starred{background:#fbf7ec}
  .gflow{font-size:12px;color:var(--c);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:8px}
  .gtask{font-size:13px;color:var(--ink-2);padding-right:10px}
  .gbars{display:grid;grid-template-columns:repeat(6,1fr);gap:3px}
  .gx{height:14px;border-radius:2px;background:#ece8dd}
  .gx.on{background:var(--c);opacity:.85}
  .legend{display:flex;flex-wrap:wrap;gap:14px;margin-top:14px;font-size:12px;color:var(--mut)}
  .legend i{display:inline-block;width:11px;height:11px;border-radius:2px;margin-right:5px;vertical-align:-1px}

  .kpi-in{width:100%;border:1px solid var(--line-2);border-radius:3px;padding:4px 6px;font-family:var(--mono);font-size:12px;background:#fff}
  .kpi-in:focus{outline:none;border-color:var(--accent)}

  .toolbar{display:flex;gap:10px;justify-content:flex-end;margin-bottom:14px}
  .btn{font-family:var(--mono);font-size:12px;border:1px solid var(--line-2);background:#fff;color:var(--ink-2);
    padding:6px 12px;border-radius:4px;cursor:pointer}
  .btn:hover{border-color:var(--accent);color:var(--accent)}
  .note{font-size:12px;color:var(--mut);margin-top:16px;line-height:1.6}
  footer{margin-top:40px;padding-top:16px;border-top:1px solid var(--line-2);font-family:var(--mono);font-size:11px;color:var(--mut)}
  @media(max-width:680px){
    .gantt-head,.grow{grid-template-columns:120px 1fr;}
    .gantt-head .wks,.gbars{grid-column:1/-1;margin-top:4px}
    .vstats{gap:16px}
  }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="eyebrow">VV CHANNEL · NEW-USER LTV · DIAGNOSIS → ACTION</div>
    <h1>新增用户 LTV 诊断与行动报告</h1>
    <div class="sub">从 LTV 经营模型出发，把数据结论自动映射为实施方案、6 周排期与 KPI 看板</div>
    <div class="meta">区间 ${esc(sum.dateRange)} · ${sum.batches} 批次 · 模型 V = 新增N × 付费率p × 客单ARPPU (LMDI-I 三因子) · 生成于 ${esc((R.meta.generatedAt || '').slice(0, 16).replace('T', ' '))}</div>
  </header>

  <div class="verdict">
    <div class="vmain">
      <div class="vk">主导诊断</div>
      <div class="vflow">${esc(d.flow)}</div>
      <div class="vdesc">${esc(d.dominantName)}<span class="${dirClass}"> ${dirArrow} ${esc(d.directionLabel)}</span> · 解释 ΔV 的 ${d.share}% · 回本曲线 <span class="${curveCls}">${curveTxt}${d.curveMult ? ' ' + d.curveMult + '×' : ''}</span></div>
    </div>
    <div class="vstats">
      <div class="vstat"><div class="n ${dec.dV >= 0 ? 'pos' : 'neg'}">${sign(dec.dV)}${dec.dVpct}%</div><div class="l">新增价值 ΔV</div></div>
      <div class="vstat"><div class="n">${fmt(sum.avgLtvD60)}</div><div class="l">平均 LTV_D60</div></div>
      <div class="vstat"><div class="n">${sum.avgRecycleMult}×</div><div class="l">平均回本倍数</div></div>
    </div>
  </div>

  <nav>
    <button class="active" data-t="overview">数据概览</button>
    <button data-t="decomp">LTV 分解</button>
    <button data-t="action">诊断 → 行动</button>
    <button data-t="gantt">6 周甘特图</button>
    <button data-t="kpi">KPI 看板</button>
  </nav>

  <section class="panel active" id="overview">
    <h2>关键指标汇总</h2>
    <div class="card">
      <table><tbody>
        <tr><td>平均新增用户</td><td class="num b">${fmt(sum.avgNewUsers)}</td><td>平均付费率D0</td><td class="num b">${(sum.avgPayRateD0 * 100).toFixed(2)}%</td></tr>
        <tr><td>平均客单价 ARPPU</td><td class="num b">${fmt(sum.avgArppuD0)}</td><td>平均 LTV_D0</td><td class="num b">${fmt(sum.avgLtvD0)}</td></tr>
        <tr><td>最高 LTV_D0 批次</td><td class="num b">${esc(sum.bestLtvD0.batch)} · ${sum.bestLtvD0.ltvD0}</td><td>最低 LTV_D0 批次</td><td class="num b">${esc(sum.worstLtvD0.batch)} · ${sum.worstLtvD0.ltvD0}</td></tr>
      </tbody></table>
    </div>
    <h2>逐批次明细</h2>
    <div class="card" style="overflow-x:auto">
      <table>
        <thead><tr><th>批次</th><th>新增</th><th>付费率D0</th><th>ARPPU</th><th>LTV_D0</th><th>LTV_D7</th><th>LTV_D30</th><th>LTV_D60</th><th>回本倍数</th></tr></thead>
        <tbody>${dataRows}</tbody>
      </table>
    </div>
  </section>

  <section class="panel" id="decomp">
    <h2>LTV 三因子分解 · ${esc(dec.from)} → ${esc(dec.to)}</h2>
    <div class="card">
      <div class="waterfall">${waterfallBars}</div>
      <div class="deltabar"><span>上期 V0 = ${fmt(dec.V0)}</span><span class="${dec.dV >= 0 ? 'pos' : 'neg'}">ΔV ${sign(dec.dV)}${fmt(dec.dV)} (${sign(dec.dV)}${dec.dVpct}%)</span><span>本期 V1 = ${fmt(dec.V1)}</span></div>
    </div>
    <div class="card">
      <table>
        <thead><tr><th>因子</th><th>加法贡献</th><th>占 ΔV</th><th>乘法因子</th><th style="text-align:left">强度</th></tr></thead>
        <tbody>${decRows}</tbody>
      </table>
      <div class="note">恒等式：新增价值 V = 新增用户数 N × 付费率 p × 客单价 ARPPU。LMDI-I 三因子分解满足「规模效应 + 转化效应 + 客单效应 = ΔV」（加法可加、无残差）。此为描述性归因，非因果推断；因果增量需对照组 / DiD。</div>
    </div>
  </section>

  <section class="panel" id="action">
    <h2>诊断 → 实行方案</h2>
    <div class="actions">${actionCards}</div>
    <div class="note">优先工作流由主导因素 + 方向自动选定，并已在「6 周甘特图」对应任务上打 ★。其余工作流为常驻支撑，按看板异常触发。</div>
  </section>

  <section class="panel" id="gantt">
    <h2>6 周实施排期 · ★ = 本期诊断优先</h2>
    <div class="card">
      <div class="gantt-head"><span>工作流</span><span>任务</span><span class="wks"><span>W1</span><span>W2</span><span>W3</span><span>W4</span><span>W5</span><span>W6</span></span></div>
      ${ganttRows}
      <div class="legend">
        <span><i style="background:#2e9e6b"></i>扩规模·稳获量</span>
        <span><i style="background:#2f7fd4"></i>提转化·促首充</span>
        <span><i style="background:#e08a2e"></i>提客单·付费深度</span>
        <span><i style="background:#8b5cf6"></i>拉曲线·促复购</span>
        <span><i style="background:#9a6a4a"></i>控成本·保ROI</span>
        <span><i style="background:#8a909c"></i>横向支撑</span>
      </div>
    </div>
  </section>

  <section class="panel" id="kpi">
    <h2>KPI 看板 · 基线与逐周登记</h2>
    <div class="toolbar"><button class="btn" id="exportBtn">导出结果 JSON</button></div>
    <div class="card" style="overflow-x:auto">
      <table>
        <thead><tr><th>KPI</th><th>基线</th><th style="text-align:left">目标</th><th>W1</th><th>W2</th><th>W3</th><th>W4</th></tr></thead>
        <tbody>${kpiRows}</tbody>
      </table>
      <div class="note">基线取区间末期值。逐周列可直接在页面填写（仅当前会话有效，导出 JSON 留档）。LTV/CAC 与回本天数仅在分析时提供 --cac 才出现。</div>
    </div>
  </section>

  <footer>ltv-model-filler · 诊断→行动闭环 · 数据与结论以内嵌 JSON 为准（#ltv-results）</footer>
</div>

<script id="ltv-results" type="application/json">${JSON.stringify(R)}</script>
<script>
  // 标签页
  const btns=[...document.querySelectorAll('nav button')], panels=[...document.querySelectorAll('.panel')];
  btns.forEach(b=>b.addEventListener('click',()=>{
    btns.forEach(x=>x.classList.remove('active'));panels.forEach(p=>p.classList.remove('active'));
    b.classList.add('active');document.getElementById(b.dataset.t).classList.add('active');
  }));
  // 导出（含手填的逐周数值）
  document.getElementById('exportBtn').addEventListener('click',()=>{
    const data=JSON.parse(document.getElementById('ltv-results').textContent);
    const weekly=[...document.querySelectorAll('#kpi tbody tr')].map(tr=>({
      kpi:tr.children[0].textContent,
      weeks:[...tr.querySelectorAll('.kpi-in')].map(i=>i.value)
    }));
    data.weeklyLog=weekly;
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);
    a.download='ltv_results_export.json';a.click();
  });
</script>
</body>
</html>`;

fs.writeFileSync(outFile, html);
console.log(`✓ 已生成 HTML 报告 ${outFile}（${(html.length / 1024).toFixed(0)} KB，内嵌结果 JSON）`);
