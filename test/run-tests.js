'use strict';

const assert = require('assert');
const path = require('path');
const { KEYWORDS, BUILTIN_TYPES, MODIFIERS, sanitize, parseSymbols, validate } = require('../src/parser');
const { parseProject, syncProjectSourceFiles, createMakefile } = require('../src/project');
const { selectCompletionLabels, pinyinAliases, matchesPinyin } = require('../src/completion');

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

function testCompletionLanguage() {
  const labels = ['可访问父对象', 'AccessParent', '检查', 'assert', '基类', 'base', '字节集', 'bin'];
  assert.deepStrictEqual(selectCompletionLabels(labels, 'chinese'), ['可访问父对象', '检查', '基类', '字节集']);
  assert.deepStrictEqual(selectCompletionLabels(labels, 'english'), ['AccessParent', 'assert', 'base', 'bin']);
  assert.deepStrictEqual(selectCompletionLabels(labels, 'bilingual'), labels);
  assert.deepStrictEqual(selectCompletionLabels(labels, 'unknown'), ['可访问父对象', '检查', '基类', '字节集']);
  assert.deepStrictEqual(pinyinAliases('本对象'), ['benduixiang', 'bdx']);
  assert(matchesPinyin('本对象', 'b'));
  assert(matchesPinyin('本对象', 'bdx'));
  assert(matchesPinyin('检查', 'jian'));
  assert(matchesPinyin('双精度小数', 'sjdxs'));
  assert(!matchesPinyin('本对象', 'jc'));
  const chineseLabels = [...KEYWORDS.map(item => item[0]), ...BUILTIN_TYPES, ...MODIFIERS]
    .filter(label => /\p{Script=Han}/u.test(label));
  for (const label of chineseLabels) assert(pinyinAliases(label).length >= 2, `缺少拼音映射：${label}`);
}

function testProjectSourceSync() {
  const projectPath = path.resolve('C:/work/工程/示例.efp');
  const entry = path.resolve('C:/work/工程/入口.ef');
  const added = path.resolve('C:/work/工程/模块/新类.ef');
  const xml = `<?xml version="1.0"?>\r\n<ef-project>\r\n  <source-files>\r\n    <source-file file="入口.ef" breakpoints="1:2" />\r\n    <source-file file="旧类.ef" bookmarks="3" />\r\n  </source-files>\r\n</ef-project>`;
  const result = syncProjectSourceFiles(xml, projectPath, [entry, added]);
  assert.strictEqual(result.added.length, 1);
  assert.strictEqual(result.removed.length, 1);
  assert(result.xml.includes('<source-file file="入口.ef" breakpoints="1:2" />'));
  assert(result.xml.includes('<source-file file="模块\\新类.ef" />'));
  assert(!result.xml.includes('旧类.ef'));
  const repeated = syncProjectSourceFiles(result.xml, projectPath, [entry, added]);
  assert.strictEqual(repeated.xml, result.xml);
  assert.strictEqual(repeated.added.length, 0);
  assert.strictEqual(repeated.removed.length, 0);
}

testParser();
testDiagnostics();
testProject();
testCompletionLanguage();
testProjectSourceSync();
console.log('EF extension tests passed.');
