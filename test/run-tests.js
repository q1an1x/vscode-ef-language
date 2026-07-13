'use strict';

const assert = require('assert');
const path = require('path');
const { sanitize, parseSymbols, validate } = require('../src/parser');
const { parseProject, createMakefile } = require('../src/project');

function testParser() {
  const source = `引入 java;
公开 类 主 {
  私有 文本 名称 = "不是 // 注释";
  /* 外层 /* 内层 */ 仍是注释 */
  公开 静态 启动() {
    如果(真) { 返回; }
  }
}`;
  const symbols = parseSymbols(source);
  assert(symbols.some(item => item.kind === 'class' && item.name === '主'));
  assert(symbols.some(item => item.kind === 'field' && item.name === '名称'));
  assert(symbols.some(item => item.kind === 'method' && item.name === '启动'));
  assert(!symbols.some(item => item.name === '如果'));
  assert.strictEqual(validate(source).length, 0);
  assert.strictEqual(sanitize(source).length, source.length);
}

function testDiagnostics() {
  const diagnostics = validate('公开 类 坏 {\n  测试(\n  /* 未结束');
  assert(diagnostics.some(item => item.message.includes('块注释')));
  assert(diagnostics.some(item => item.message.includes('（') || item.message.includes('(')));
  assert(diagnostics.some(item => item.message.includes('｛') || item.message.includes('{')));
}

function testProject() {
  const projectPath = path.resolve('C:/work/含 空格/示例.efp');
  const xml = `<?xml version="1.0"?><ef-project><information><name>示例</name></information>
  <setting><type>runable</type><out>示例.exe</out><efl-name>示例库</efl-name><main-class>主</main-class></setting>
  <source-files><source-file file=".\\入口.ef"/><source-file file="模块\\类.ef" /></source-files></ef-project>`;
  const project = parseProject(xml, projectPath);
  assert.strictEqual(project.name, '示例');
  assert.strictEqual(project.mainClass, '主');
  assert.strictEqual(project.sourceFiles.length, 2);
  const makefile = createMakefile(project, { debug: true, infoFiles: [path.resolve('C:/work/含 空格/示例.inf')] });
  assert(makefile.includes('-dbg'));
  assert(makefile.includes('-main_class="主"'));
  assert(makefile.includes('-out="'));
  assert(makefile.includes('含 空格'));
  assert(makefile.includes('入口.ef'));
  const lines = makefile.trim().split(/\r?\n/);
  assert(lines.find(line => line.startsWith('-out=')).match(/^-out=".*含 空格.*"$/));
  assert(!lines.find(line => line.endsWith('入口.ef')).includes('"'));
  assert(!lines.find(line => line.endsWith('示例.inf')).includes('"'));
}

testParser();
testDiagnostics();
testProject();
console.log('EF extension tests passed.');
