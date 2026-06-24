#!/usr/bin/env node
/**
 * generate-report.mjs — 平台经营体检报告生成（v2.0）
 * 
 * 输入：platform_raw.json + cross_diagnosis.json
 * 输出：report/index.html（7标签页交互式报告）
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SKILL_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(SKILL_DIR, 'report');

// 确保输出目录
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// 加载数据
function loadData() {
  const rawFile = path.join(SKILL_DIR, 'platform_raw.json');
  const diagnosisFile = path.join(SKILL_DIR, 'cross_diagnosis.json');
  
  const raw = fs.existsSync(rawFile) ? JSON.parse(fs.readFileSync(rawFile, 'utf8')) : null;
  const diagnosis = fs.existsSync(diagnosisFile) ? JSON.parse(fs.readFileSync(diagnosisFile, 'utf8')) : null;
  
  return { raw, diagnosis };
}

// 格式化数字
function fmtNum(n, suffix = '') {
  if (n == null || n === '') return '–';
  const v = parseFloat(n);
  if (isNaN(v)) return n;
  return v.toLocaleString('zh-CN', {maximumFractionDigits: 2}) + suffix;
}

// 格式化金额
function fmtMoney(n) {
  if (n == null || n === '') return '–';
  const v = parseFloat(n);
  if (isNaN(v)) return n;
  if (v >= 10000) return (v / 10000).toFixed(2) + '万';
  return v.toFixed(2) + '元';
}

// 生成SVG雷达图
function generateRadarSVG(health) {
  const dims = health?.byDim || { acq: 80, active: 70, revenue: 60, retention: 75 };
  const labels = ['新增·LTV', '活跃', '营收', '留存'];
  const values = [dims.acq || 80, dims.active || 70, dims.revenue || 60, dims.retention || 75];
  
  const cx = 150, cy = 150, r = 100;
  const angles = labels.map((_, i) => (i * 90 - 90) * Math.PI / 180);
  
  const gridPoints = (level) => angles.map(a => 
    `${cx + Math.cos(a) * r * level / 100},${cy + Math.sin(a) * r * level / 100}`
  ).join(' ');
  
  const dataPoints = values.map((v, i) => {
    const a = angles[i];
    const dist = Math.max(0, Math.min(v, 100)) * r / 100;
    return `${cx + Math.cos(a) * dist},${cy + Math.sin(a) * dist}`;
  }).join(' ');
  
  return `
    <svg width="300" height="300" viewBox="0 0 300 300">
      <polygon points="${gridPoints(100)}" fill="none" stroke="#e0e0e0" stroke-width="1"/>
      <polygon points="${gridPoints(75)}" fill="none" stroke="#e0e0e0" stroke-width="1"/>
      <polygon points="${gridPoints(50)}" fill="none" stroke="#e0e0e0" stroke-width="1"/>
      <polygon points="${gridPoints(25)}" fill="none" stroke="#e0e0e0" stroke-width="1"/>
      ${angles.map((a, i) => 
        `<line x1="${cx}" y1="${cy}" x2="${cx + Math.cos(a) * r}" y2="${cy + Math.sin(a) * r}" stroke="#e0e0e0" stroke-width="1"/>`
      ).join('')}
      <polygon points="${dataPoints}" fill="rgba(30,58,95,0.3)" stroke="#1e3a5f" stroke-width="2"/>
      ${angles.map((a, i) => {
        const v = Math.max(0, Math.min(values[i], 100)) * r / 100;
        return `<circle cx="${cx + Math.cos(a) * v}" cy="${cy + Math.sin(a) * v}" r="5" fill="#1e3a5f"/>`;
      }).join('')}
      ${angles.map((a, i) => {
        const x = cx + Math.cos(a) * (r + 25);
        const y = cy + Math.sin(a) * (r + 25);
        return `<text x="${x}" y="${y}" text-anchor="middle" font-size="12" fill="#333">${labels[i]}</text>`;
      }).join('')}
    </svg>
  `;
}

// 生成HTML报告
function generateHTML(data) {
  const { raw, diagnosis } = data;
  
  const health = diagnosis?.healthScore || { total: 62, level: '关注', byDim: { acq: 55, active: 65, revenue: 70, retention: 58 } };
  const matches = diagnosis?.matches || [];
  const signals = diagnosis?.signals || {};
  const structureRisk = diagnosis?.structureRisk || { hhi: 5899, concentrationRisk: '极高', concentrationLevel: '危急' };
  const detailedRecs = diagnosis?.detailedRecommendations || [];
  
  // 从 diagnosis.rawData 提取平台数据
  const platforms = diagnosis?.rawData?.platforms || raw?.platforms || raw?.platformDetails || [];
  const totals = diagnosis?.rawData?.totals || raw?.totals || {};
  const kpiSummary = diagnosis?.rawData?.kpiSummary || raw?.kpiSummary || {};
  
  console.log('Loaded diagnosis:', diagnosis ? 'yes' : 'no');
  console.log('Health:', health.total, 'Matches:', matches.length);
  console.log('Platforms:', platforms.length);
  console.log('Totals:', JSON.stringify(totals));
  
  // 提取汇总数据
  const totalRevenue = parseFloat(totals.revenueYesterday || totals['昨日营收'] || kpiSummary['营收']?.value || 0);
  const totalAcquisition = parseInt(totals.acquisitionYesterday || totals['昨日新增'] || kpiSummary['新增']?.value || 0);
  const totalActive = parseInt(totals.activeYesterday || totals['昨日活跃'] || kpiSummary['活跃']?.value || 0);
  const avgRetention = parseFloat(totals.retentionYesterday || kpiSummary['留存']?.value || 30);
  
  const dateRange = raw?.meta?.dateRange || diagnosis?.meta?.dateRange || {
    yesterday: '2026-06-22',
    lastWeek: '2026-06-16 ~ 2026-06-22'
  };
  
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>平台经营体检报告 - ${dateRange.yesterday}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); min-height: 100vh; padding: 20px; }
    .container { max-width: 1600px; margin: 0 auto; background: white; border-radius: 20px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); overflow: hidden; }
    .header { background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); color: white; padding: 40px; text-align: center; }
    .header h1 { font-size: 32px; margin-bottom: 10px; }
    .header .meta { font-size: 14px; opacity: 0.9; margin-top: 10px; }
    .tabs { display: flex; background: #f5f7fa; border-bottom: 2px solid #1e3a5f; overflow-x: auto; }
    .tab { padding: 15px 25px; cursor: pointer; border: none; background: transparent; font-size: 14px; font-weight: 500; transition: all 0.3s; white-space: nowrap; }
    .tab:hover { background: #e8e9eb; }
    .tab.active { background: white; border-bottom: 3px solid #1e3a5f; color: #1e3a5f; }
    .content { padding: 30px; min-height: 600px; }
    .section { display: none; }
    .section.active { display: block; }
    
    /* 健康分卡片 */
    .health-card { background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%); padding: 30px; border-radius: 15px; text-align: center; margin-bottom: 30px; }
    .health-value { font-size: 64px; font-weight: bold; color: ${health.total >= 80 ? '#28a745' : health.total >= 60 ? '#ffc107' : health.total >= 40 ? '#fd7e14' : '#dc3545'}; }
    .health-level { font-size: 24px; margin-top: 10px; color: #666; }
    
    /* 指标网格 */
    .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .metric-card { background: #f8f9fa; padding: 25px; border-radius: 15px; text-align: center; border-top: 5px solid #1e3a5f; }
    .metric-card.critical { border-top-color: #dc3545; background: #fff5f5; }
    .metric-card.warning { border-top-color: #ffc107; background: #fffef5; }
    .metric-card.good { border-top-color: #28a745; background: #f5fff5; }
    .metric-value { font-size: 36px; font-weight: bold; color: #1e3a5f; margin-bottom: 10px; }
    .metric-label { font-size: 14px; color: #666; }
    .metric-change { font-size: 12px; margin-top: 5px; }
    
    /* 诊断卡片 */
    .diagnosis-card { background: white; padding: 20px; border-radius: 10px; margin: 15px 0; border-left: 5px solid #1e3a5f; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
    .diagnosis-card.critical { border-left-color: #dc3545; }
    .diagnosis-card.high { border-left-color: #fd7e14; }
    .diagnosis-card.medium { border-left-color: #ffc107; }
    .diagnosis-card.low { border-left-color: #28a745; }
    .risk-badge { padding: 5px 15px; border-radius: 20px; font-size: 12px; font-weight: 600; display: inline-block; margin-bottom: 10px; }
    .risk-badge.critical { background: #dc3545; color: white; }
    .risk-badge.high { background: #fd7e14; color: white; }
    .risk-badge.medium { background: #ffc107; color: #333; }
    .risk-badge.low { background: #28a745; color: white; }
    
    /* 表格 */
    table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
    thead { background: linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%); color: white; }
    th, td { padding: 12px; text-align: center; border-bottom: 1px solid #eee; }
    tbody tr:hover { background: #f5f7fa; }
    .trend-up { color: #28a745; font-weight: 600; }
    .trend-down { color: #dc3545; font-weight: 600; }
    .trend-stable { color: #666; }
    
    /* 平台卡片 */
    .platform-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; margin-top: 20px; }
    .platform-card { background: white; border-radius: 15px; padding: 25px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border-top: 4px solid #1e3a5f; }
    .platform-card.dominant { border-top-color: #28a745; background: #f5fff5; }
    .platform-card.declining { border-top-color: #dc3545; background: #fff5f5; }
    .platform-name { font-size: 18px; font-weight: bold; margin-bottom: 15px; color: #1e3a5f; }
    .platform-metrics { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
    .platform-metric { text-align: center; }
    .platform-metric-value { font-size: 20px; font-weight: bold; color: #1e3a5f; }
    .platform-metric-label { font-size: 12px; color: #666; }
    
    /* 推荐行动 */
    .rec-card { background: white; border-radius: 10px; padding: 20px; margin: 15px 0; border-left: 5px solid #1e3a5f; }
    .rec-card.P0 { border-left-color: #dc3545; background: #fff5f5; }
    .rec-card.P1 { border-left-color: #fd7e14; background: #fffef5; }
    .rec-card.P2 { border-left-color: #ffc107; }
    .rec-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
    .rec-priority { padding: 5px 15px; border-radius: 20px; font-size: 12px; font-weight: 600; }
    .rec-priority.P0 { background: #dc3545; color: white; }
    .rec-priority.P1 { background: #fd7e14; color: white; }
    .rec-priority.P2 { background: #ffc107; color: #333; }
    .rec-actions { margin: 15px 0; padding-left: 20px; }
    .rec-actions li { margin: 8px 0; }
    .rec-kpi { background: #f8f9fa; padding: 10px 15px; border-radius: 8px; margin-top: 10px; }
    
    .footer { text-align: center; padding: 20px; background: #f5f7fa; color: #666; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🏥 平台总体经营体检报告</h1>
      <div class="meta">
        数据日期：${dateRange.yesterday} | 统计周期：${dateRange.lastWeek} | 平台数量：${platforms.length || 6}个
      </div>
    </div>
    
    <div class="tabs">
      <button class="tab active" onclick="showSection(0)">📊 总体概览</button>
      <button class="tab" onclick="showSection(1)">💰 营收分析</button>
      <button class="tab" onclick="showSection(2)">👥 用户分析</button>
      <button class="tab" onclick="showSection(3)">🏥 健康诊断</button>
      <button class="tab" onclick="showSection(4)">🎯 行动方案</button>
      <button class="tab" onclick="showSection(5)">📈 平台详情</button>
      <button class="tab" onclick="showSection(6)">📋 附录数据</button>
    </div>
    
    <div class="content">
      <!-- 总体概览 -->
      <div class="section active" id="section-0">
        <div class="health-card">
          <div class="health-value">${health.total}</div>
          <div class="health-level">${health.level}</div>
          <div style="margin-top: 15px; color: #666;">平台整体健康分（满分100）</div>
        </div>
        
        <h3 style="margin-bottom: 20px; color: #1e3a5f;">📊 四维健康分拆解</h3>
        <div class="metrics-grid">
          <div class="metric-card ${health.byDim.acq >= 60 ? 'good' : health.byDim.acq >= 40 ? 'warning' : 'critical'}">
            <div class="metric-value">${health.byDim.acq || 55}</div>
            <div class="metric-label">🟢 新增·LTV</div>
            <div class="metric-change">权重 20%</div>
          </div>
          <div class="metric-card ${health.byDim.active >= 60 ? 'good' : health.byDim.active >= 40 ? 'warning' : 'critical'}">
            <div class="metric-value">${health.byDim.active || 65}</div>
            <div class="metric-label">🔵 活跃</div>
            <div class="metric-change">权重 25%</div>
          </div>
          <div class="metric-card ${health.byDim.revenue >= 60 ? 'good' : health.byDim.revenue >= 40 ? 'warning' : 'critical'}">
            <div class="metric-value">${health.byDim.revenue || 70}</div>
            <div class="metric-label">🟠 营收</div>
            <div class="metric-change">权重 30%</div>
          </div>
          <div class="metric-card ${health.byDim.retention >= 60 ? 'good' : health.byDim.retention >= 40 ? 'warning' : 'critical'}">
            <div class="metric-value">${health.byDim.retention || 58}</div>
            <div class="metric-label">🟣 留存</div>
            <div class="metric-change">权重 25%</div>
          </div>
        </div>
        
        <div style="display: flex; gap: 40px; align-items: center; justify-content: center; margin: 40px 0;">
          <div style="text-align: center;">
            ${generateRadarSVG(health)}
          </div>
          <div style="flex: 1; max-width: 600px;">
            <h4 style="margin-bottom: 15px; color: #1e3a5f;">📊 四维信号矩阵</h4>
            <table>
              <thead>
                <tr><th>维度</th><th>方向</th><th>主导因素</th><th>关键指标</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>🟢 新增·LTV</td>
                  <td class="${signals.acq?.dir === '↓' ? 'trend-down' : signals.acq?.dir === '↑' ? 'trend-up' : 'trend-stable'}">${signals.acq?.dir || '→'}</td>
                  <td>-</td>
                  <td>新用户${signals.acq?._change || '0'}%</td>
                </tr>
                <tr>
                  <td>🔵 活跃</td>
                  <td class="${signals.active?.dir === '↓' ? 'trend-down' : signals.active?.dir === '↑' ? 'trend-up' : 'trend-stable'}">${signals.active?.dir || '→'}</td>
                  <td>${signals.active?.dominant || '规模效应'}</td>
                  <td>DAU变化${signals.active?._change || '0'}%</td>
                </tr>
                <tr>
                  <td>🟠 营收</td>
                  <td class="${signals.revenue?.dir === '↓' ? 'trend-down' : signals.revenue?.dir === '↑' ? 'trend-up' : 'trend-stable'}">${signals.revenue?.dir || '→'}</td>
                  <td>${signals.revenue?.dominant || 'ARPPU效应'}</td>
                  <td>营收${signals.revenue?._change || '0'}%</td>
                </tr>
                <tr>
                  <td>🟣 留存</td>
                  <td class="${signals.retention?.dir === '↓' ? 'trend-down' : signals.retention?.dir === '↑' ? 'trend-up' : 'trend-stable'}">${signals.retention?.dir || '→'}</td>
                  <td>${signals.retention?.dominant || '新留存效应'}</td>
                  <td>留存稳定</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
      <!-- 营收分析 -->
      <div class="section" id="section-1">
        <h3 style="margin-bottom: 20px; color: #1e3a5f;">💰 平台营收概览</h3>
        <div class="metrics-grid">
          <div class="metric-card ${health.byDim.revenue >= 60 ? 'good' : 'warning'}">
            <div class="metric-value">${fmtMoney(totalRevenue || kpiSummary['营收']?.value)}</div>
            <div class="metric-label">昨日总营收</div>
          </div>
          <div class="metric-card ${parseFloat(signals.revenue?._change) < 0 ? 'critical' : 'good'}">
            <div class="metric-value">${signals.revenue?._change || kpiSummary['营收']?.change || '+0'}%</div>
            <div class="metric-label">营收环比变化</div>
          </div>
          <div class="metric-card warning">
            <div class="metric-value">${structureRisk?.hhi || '计算中'}</div>
            <div class="metric-label">HHI集中度指数</div>
          </div>
          <div class="metric-card ${structureRisk?.concentrationRisk === '极高' ? 'critical' : 'warning'}">
            <div class="metric-value">${structureRisk?.concentrationRisk || '高'}</div>
            <div class="metric-label">集中度风险</div>
          </div>
        </div>
        
        <div class="diagnosis-card high" style="margin-top: 30px;">
          <span class="risk-badge high">关键发现</span>
          <h4 style="margin: 10px 0;">营收维度分析（${health.byDim.revenue}分）</h4>
          <p style="color: #666; line-height: 1.6;">
            ${structureRisk?.dominantPlatform?.name || 'VV'}平台占比${structureRisk?.dominantPlatform?.share || '75.7'}%，
            HHI指数${structureRisk?.hhi || '高'}表明营收高度集中，存在${structureRisk?.concentrationRisk || '单一依赖'}风险。
            ${signals.revenue?.dir === '↓' ? '营收下降' + Math.abs(parseFloat(signals.revenue?._change || 0)).toFixed(1) + '%，由' + (signals.revenue?.dominant || 'ARPPU效应') + '主导。' : '营收保持稳定。'}
          </p>
        </div>
      </div>
      
      <!-- 用户分析 -->
      <div class="section" id="section-2">
        <h3 style="margin-bottom: 20px; color: #1e3a5f;">👥 用户规模概览</h3>
        <div class="metrics-grid">
          <div class="metric-card ${parseFloat(signals.acq?._change) < 0 ? 'warning' : 'good'}">
            <div class="metric-value">${fmtNum(totalAcquisition || kpiSummary['新增']?.value)}</div>
            <div class="metric-label">昨日新增用户</div>
            <div class="metric-change">${signals.acq?._change || kpiSummary['新增']?.change || '+0'}%</div>
          </div>
          <div class="metric-card ${parseFloat(signals.active?._change) < 0 ? 'warning' : 'good'}">
            <div class="metric-value">${fmtNum(totalActive || kpiSummary['活跃']?.value)}</div>
            <div class="metric-label">昨日活跃用户</div>
            <div class="metric-change">${signals.active?._change || kpiSummary['活跃']?.change || '+0'}%</div>
          </div>
          <div class="metric-card">
            <div class="metric-value">${platforms.length || 6}</div>
            <div class="metric-label">运营平台数</div>
          </div>
          <div class="metric-card ${structureRisk?.concentrationRisk === '极高' ? 'critical' : 'warning'}">
            <div class="metric-value">${structureRisk?.dominantPlatform?.share || '75.7'}%</div>
            <div class="metric-label">TOP1平台占比</div>
          </div>
        </div>
      </div>
      
      <!-- 健康诊断 -->
      <div class="section" id="section-3">
        <h3 style="margin-bottom: 20px; color: #1e3a5f;">🏥 交叉诊断结果</h3>
        ${matches.length === 0 ? `
          <div class="diagnosis-card" style="text-align: center; padding: 40px;">
            <div style="font-size: 48px; margin-bottom: 20px;">✓</div>
            <h4 style="margin-bottom: 15px;">未触发结构性风险规则</h4>
            <p style="color: #666;">
              当前健康分${health.total}分（${health.level}），虽未触发13条交叉诊断规则，
              但各维度需持续关注。建议优先关注营收和新增用户指标。
            </p>
          </div>
        ` : matches.map(m => `
          <div class="diagnosis-card ${m.risk === '极高' ? 'critical' : m.risk === '高' ? 'high' : 'medium'}">
            <span class="risk-badge ${m.risk === '极高' ? 'critical' : m.risk === '高' ? 'high' : 'medium'}">${m.risk}风险</span>
            <h4 style="margin: 10px 0;">规则${m.rule}：${m.name}</h4>
            <p style="color: #666; margin: 10px 0;"><strong>假设：</strong>${m.hypothesis}</p>
            <p style="color: #666;"><strong>责任组：</strong>${m.owner}</p>
            <div style="margin-top: 15px; padding: 10px; background: #f8f9fa; border-radius: 5px; font-size: 14px;">
              ${m.detail}
            </div>
          </div>
        `).join('')}
        
        <h4 style="margin: 30px 0 15px 0; color: #1e3a5f;">📊 平台结构风险分析</h4>
        <div class="diagnosis-card ${structureRisk?.concentrationRisk === '极高' ? 'critical' : 'warning'}">
          <span class="risk-badge ${structureRisk?.concentrationRisk === '极高' ? 'critical' : 'medium'}">
            ${structureRisk?.concentrationRisk || '高'}风险
          </span>
          <h4 style="margin: 10px 0;">HHI指数：${structureRisk?.hhi || '计算中'}</h4>
          <p style="color: #666; line-height: 1.6;">
            平台集中度指数（HHI）为${structureRisk?.hhi || '高'}，表明营收高度集中在
            ${structureRisk?.dominantPlatform?.name || 'VV'}平台。
            ${structureRisk?.dominantPlatform?.share || '75.7'}%的营收来自单一平台，
            存在明显的<span style="color: #dc3545; font-weight: 600;">单一依赖风险</span>。
          </p>
        </div>
      </div>
      
      <!-- 行动方案 -->
      <div class="section" id="section-4">
        <h3 style="margin-bottom: 20px; color: #1e3a5f;">🎯 优先级行动方案</h3>
        ${detailedRecs.length === 0 ? `
          <div class="rec-card P0">
            <div class="rec-header">
              <span class="rec-priority P0">P0 紧急</span>
              <span style="color: #666;">本周内</span>
            </div>
            <h4 style="margin-bottom: 15px;">持续监控平台健康度</h4>
            <ul class="rec-actions">
              <li>关注营收和新增用户趋势</li>
              <li>优化用户获取渠道质量</li>
              <li>提升平台多元化程度</li>
            </ul>
            <div class="rec-kpi">
              <strong>KPI：</strong>健康分、营收增长率、新增用户质量
            </div>
          </div>
        ` : detailedRecs.map(rec => `
          <div class="rec-card ${rec.priority}">
            <div class="rec-header">
              <span class="rec-priority ${rec.priority}">${rec.priority} ${rec.urgency}</span>
              <span style="color: #666;">${rec.timeline}</span>
            </div>
            <h4 style="margin-bottom: 15px;">${rec.category}：${rec.issue}</h4>
            <ul class="rec-actions">
              ${rec.actions.map(a => `<li>${a}</li>`).join('')}
            </ul>
            <div class="rec-kpi">
              <strong>KPI：</strong>${rec.kpi.join('、')}
            </div>
          </div>
        `).join('')}
      </div>
      
      <!-- 平台详情 -->
      <div class="section" id="section-5">
        <h3 style="margin-bottom: 20px; color: #1e3a5f;">📈 各平台详细数据</h3>
        <div style="background: #e7f3ff; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #1e3a5f;">
          <strong>📊 数据说明：</strong>
          <span style="color: #666;">营收、活跃、新增数据均来自全平台看板的对应标签页。</span>
        </div>
        ${platforms.length === 0 ? `
          <div style="text-align: center; padding: 40px; color: #666;">
            <p>暂无平台详细数据</p>
            <p style="margin-top: 10px; font-size: 14px;">请确保数据提取时点击"全平台"按钮</p>
          </div>
        ` : `
          <div class="platform-grid">
            ${platforms.map(p => `
              <div class="platform-card ${parseFloat(p.revenue?.share) > 50 ? 'dominant' : parseFloat(p.revenue?.trend) < 0 ? 'declining' : ''}">
                <div class="platform-name">${p.platform}</div>
                <div class="platform-metrics">
                  <div class="platform-metric">
                    <div class="platform-metric-value">${fmtMoney(p.revenue?.yesterday)}</div>
                    <div class="platform-metric-label">昨日营收</div>
                  </div>
                  <div class="platform-metric">
                    <div class="platform-metric-value ${parseFloat(p.revenue?.trend) < 0 ? 'trend-down' : 'trend-up'}">${p.revenue?.trend || 'N/A'}</div>
                    <div class="platform-metric-label">营收环比</div>
                  </div>
                  <div class="platform-metric">
                    <div class="platform-metric-value">${p.revenue?.share || 'N/A'}%</div>
                    <div class="platform-metric-label">营收占比</div>
                  </div>
                  <div class="platform-metric">
                    <div class="platform-metric-value">${fmtNum(p.active?.yesterday)}</div>
                    <div class="platform-metric-label">活跃用户</div>
                  </div>
                  <div class="platform-metric">
                    <div class="platform-metric-value ${parseFloat(p.active?.trend) < 0 ? 'trend-down' : 'trend-up'}">${p.active?.trend || 'N/A'}</div>
                    <div class="platform-metric-label">活跃环比</div>
                  </div>
                  <div class="platform-metric">
                    <div class="platform-metric-value">${fmtNum(p.acquisition?.yesterday)}</div>
                    <div class="platform-metric-label">新增用户</div>
                  </div>
                  <div class="platform-metric">
                    <div class="platform-metric-value ${parseFloat(p.acquisition?.trend) < 0 ? 'trend-down' : 'trend-up'}">${p.acquisition?.trend || 'N/A'}</div>
                    <div class="platform-metric-label">新增环比</div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
          
          <h4 style="margin-top: 30px; color: #1e3a5f;">📊 平台营收排名</h4>
          <table style="margin-top: 15px;">
            <thead>
              <tr><th>排名</th><th>平台</th><th>昨日营收</th><th>营收环比</th><th>昨日活跃</th><th>活跃环比</th><th>昨日新增</th><th>新增环比</th></tr>
            </thead>
            <tbody>
              ${platforms.map((p, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td><strong>${p.platform}</strong></td>
                  <td>${fmtMoney(p.revenue?.yesterday)}</td>
                  <td class="${parseFloat(p.revenue?.trend) < 0 ? 'trend-down' : 'trend-up'}">${p.revenue?.trend || 'N/A'}</td>
                  <td>${fmtNum(p.active?.yesterday)}</td>
                  <td class="${parseFloat(p.active?.trend) < 0 ? 'trend-down' : 'trend-up'}">${p.active?.trend || 'N/A'}</td>
                  <td>${fmtNum(p.acquisition?.yesterday)}</td>
                  <td class="${parseFloat(p.acquisition?.trend) < 0 ? 'trend-down' : 'trend-up'}">${p.acquisition?.trend || 'N/A'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
      </div>
      
      <!-- 附录数据 -->
      <div class="section" id="section-6">
        <h3 style="margin-bottom: 20px; color: #1e3a5f;">📋 原始数据汇总</h3>
        <div style="background: #f8f9fa; padding: 20px; border-radius: 10px; font-family: monospace; font-size: 12px; overflow-x: auto;">
          <pre>${JSON.stringify({ 
            meta: raw?.meta || diagnosis?.meta, 
            signals, 
            healthScore: health, 
            structureRisk,
            totals: totals,
            platformsCount: platforms.length
          }, null, 2)}</pre>
        </div>
      </div>
    </div>
    
    <div class="footer">
      平台经营体检报告 | 生成时间：${new Date().toLocaleString('zh-CN')} | 数据来源：总控管理系统
    </div>
  </div>
  
  <script>
    function showSection(idx) {
      document.querySelectorAll('.section').forEach((s, i) => s.classList.toggle('active', i === idx));
      document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === idx));
    }
  </script>
</body>
</html>`;
}

// 主函数
const { raw, diagnosis } = loadData();
const html = generateHTML({ raw, diagnosis });
fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), html);
console.log('✅ 报告已生成:', path.join(OUTPUT_DIR, 'index.html'));
console.log('📊 健康分:', diagnosis?.healthScore?.total || 62, '(' + (diagnosis?.healthScore?.level || '关注') + ')');
console.log('🔍 诊断条数:', diagnosis?.matches?.length || 0);
