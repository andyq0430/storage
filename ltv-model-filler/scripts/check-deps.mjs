#!/usr/bin/env node
/**
 * LTV Model Filler - 依赖检查脚本
 * 
 * 检查项：
 * 1. Node.js版本（需要22+）
 * 2. ExcelJS库是否安装
 * 3. Excel模型文件是否存在
 */

import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const exec = promisify(execCallback);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REQUIRED_NODE_VERSION = 22;
const REQUIRED_EXCELJS_VERSION = '4.0.0';

/**
 * 检查Node.js版本
 */
function checkNodeVersion() {
  const version = process.version.replace('v', '');
  const major = parseInt(version.split('.')[0], 10);
  
  if (major < REQUIRED_NODE_VERSION) {
    console.error(`❌ Node.js版本过低: ${process.version} (需要 ${REQUIRED_NODE_VERSION}+)`);
    process.exit(1);
  }
  
  console.log(`✓ Node.js: ${process.version}`);
  return true;
}

/**
 * 检查ExcelJS库
 */
async function checkExcelJS() {
  try {
    const exceljsPath = path.join(__dirname, '..', 'node_modules', 'exceljs');
    if (fs.existsSync(exceljsPath)) {
      const pkgPath = path.join(exceljsPath, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      console.log(`✓ ExcelJS: ${pkg.version}`);
      return true;
    }
  } catch (err) {
    // ExcelJS未安装
  }
  
  console.log('⚠ ExcelJS未安装，正在安装...');
  await exec('npm install exceljs', { cwd: path.join(__dirname, '..') });
  console.log('✓ ExcelJS已安装');
  return true;
}

/**
 * 检查Excel模型文件
 */
function checkExcelModel(modelPath) {
  const defaultPath = modelPath || path.join(process.cwd(), '游戏LTV经营模型.xlsx');
  
  if (fs.existsSync(defaultPath)) {
    console.log(`✓ Excel模型: ${defaultPath}`);
    return defaultPath;
  }
  
  console.log(`⚠ Excel模型文件不存在: ${defaultPath}`);
  console.log('  请提供Excel模型文件路径，或在工作目录创建"游戏LTV经营模型.xlsx"');
  return null;
}

/**
 * 主检查流程
 */
async function main() {
  console.log('━'.repeat(50));
  console.log('LTV Model Filler - 依赖检查');
  console.log('━'.repeat(50));
  
  // 1. Node.js版本
  checkNodeVersion();
  
  // 2. ExcelJS库
  await checkExcelJS();
  
  // 3. Excel模型文件
  const modelPath = checkExcelModel(process.argv[2]);
  
  console.log('━'.repeat(50));
  
  if (modelPath) {
    console.log('✅ 所有依赖已就绪');
    console.log(`\n💡 运行填充脚本: node scripts/fill-model.mjs`);
    process.exit(0);
  } else {
    console.log('⚠️  缺少Excel模型文件');
    console.log('\n使用方式:');
    console.log('  node check-deps.mjs [模型文件路径]');
    process.exit(2);
  }
}

main().catch(err => {
  console.error('检查失败:', err.message);
  process.exit(1);
});