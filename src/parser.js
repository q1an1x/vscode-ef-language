'use strict';

const IDENTIFIER = '[\\p{L}_][\\p{L}\\p{N}_]*';
const MODIFIERS = [
  '公开', '扩展', '私有', '隐藏', '静态', '常量', '事件处理', '属性', '可为空', '最终',
  '扩展开始', '遍历方法', '类型转换', '可访问父对象', 'public', 'protected', 'private',
  'hidden', 'static', 'const', 'EventHandler', 'property', 'nullable', 'final', 'extendable',
  'enumerater', 'TypeConverter', 'AccessParent'
];
const CONTROL_WORDS = new Set([
  '开始', '循环', '计次循环', '遍历循环', 'C循环', '如果', '又如', '否则', '假如', '为',
  '为其他', '返回', '创建', '检查', 'do', 'while', 'counter', 'foreach', 'for', 'if',
  'else', 'switch', 'case', 'return', 'new', 'assert'
]);

const KEYWORDS = [
  ['类库', 'library', '定义类库信息'], ['类', 'class', '定义类'], ['枚举', 'enum', '定义枚举'],
  ['接口', 'interface', '定义接口'], ['友好名称', 'FriendlyName', '定义友好名称'],
  ['开始', 'do', '先执行后判断的循环'], ['循环', 'while', '条件循环'],
  ['计次循环', 'counter', '循环指定次数'], ['遍历循环', 'foreach', '遍历数组或可遍历对象'],
  ['C循环', 'for', 'C 风格循环'], ['到循环尾', 'continue', '跳到当前循环尾部'],
  ['跳出', 'break', '跳出当前循环或假如语句'], ['循环尾', 'tail', '定义循环尾代码'],
  ['如果', 'if', '条件分支'], ['又如', 'else if', '追加条件分支'], ['否则', 'else', '默认条件分支'],
  ['假如', 'switch', '多分支选择'], ['为', 'case', '选择分支'], ['为其他', 'default', '默认选择分支'],
  ['返回', 'return', '从当前方法返回'], ['引入', 'import', '引入类库'], ['创建', 'new', '创建对象或数组'],
  ['检查', 'assert', '调试版本运行时断言'], ['是否定义', 'defined', '检查预编译常量'],
  ['真', 'true', '逻辑真'], ['假', 'false', '逻辑假'], ['空', 'null', '空对象或空数组'],
  ['本对象', 'this', '当前类对象'], ['基类', 'base', '当前类的基类']
];

const BUILTIN_TYPES = [
  '逻辑', '字节', '短整数', '整数', '长整数', '小数', '双精度小数', '文本', '字节集', '对象',
  '动态类型', '弱类型', 'boolean', 'byte', 'short', 'int', 'long', 'float', 'double', 'string',
  'bin', 'object', 'variant'
];

function blankRange(chars, start, end) {
  for (let i = start; i < end; i += 1) {
    if (chars[i] !== '\n' && chars[i] !== '\r') chars[i] = ' ';
  }
}

/** Replace comments and strings with spaces while preserving offsets and line endings. */
function sanitize(text) {
  const chars = [...text];
  let i = 0;
  let blockDepth = 0;
  while (i < text.length) {
    if (blockDepth > 0) {
      if (text.startsWith('/*', i)) {
        blankRange(chars, i, i + 2); blockDepth += 1; i += 2; continue;
      }
      if (text.startsWith('*/', i)) {
        blankRange(chars, i, i + 2); blockDepth -= 1; i += 2; continue;
      }
      blankRange(chars, i, i + 1); i += 1; continue;
    }
    if (text.startsWith('//', i)) {
      const end = text.indexOf('\n', i);
      blankRange(chars, i, end < 0 ? text.length : end); i = end < 0 ? text.length : end; continue;
    }
    if (text.startsWith('/*', i)) {
      blankRange(chars, i, i + 2); blockDepth = 1; i += 2; continue;
    }
    if (text[i] === '"' || text[i] === "'") {
      const quote = text[i];
      blankRange(chars, i, i + 1); i += 1;
      while (i < text.length) {
        if (text[i] === '\\') { blankRange(chars, i, Math.min(text.length, i + 2)); i += 2; continue; }
        const done = text[i] === quote;
        blankRange(chars, i, i + 1); i += 1;
        if (done) break;
      }
      continue;
    }
    i += 1;
  }
  return chars.join('');
}

function offsetsForLines(text) {
  const result = [0];
  for (let i = 0; i < text.length; i += 1) if (text[i] === '\n') result.push(i + 1);
  return result;
}

function parseSymbols(text) {
  const clean = sanitize(text);
  const lines = clean.split(/\r?\n/);
  const originalLines = text.split(/\r?\n/);
  const offsets = offsetsForLines(text);
  const symbols = [];
  let depth = 0;
  let currentType = null;
  // JavaScript's \b only understands ASCII word characters, so it cannot be
  // used as the left boundary for Chinese keywords.
  const typePattern = new RegExp(`(?:^|[^\\p{L}\\p{N}_])(类库|library|类|class|接口|interface|枚举|enum)\\s+(${IDENTIFIER})`, 'u');
  const modifiers = `(?:(?:${MODIFIERS.join('|')})\\s+)*`;
  const methodPattern = new RegExp(`^\\s*${modifiers}(?:(${IDENTIFIER}(?:\\s*\\[\\])?)\\s+)?(${IDENTIFIER})\\s*\\(`, 'u');
  const fieldPattern = new RegExp(`^\\s*${modifiers}(${IDENTIFIER}(?:\\s*\\[\\])?)\\s+(${IDENTIFIER})\\s*(?:=|;)`, 'u');

  for (let line = 0; line < lines.length; line += 1) {
    const source = lines[line];
    const lineStartDepth = depth;
    const typeMatch = source.match(typePattern);
    if (typeMatch) {
      const nameIndex = source.indexOf(typeMatch[2], typeMatch.index);
      const kindMap = { '类库': 'library', library: 'library', '类': 'class', class: 'class', '接口': 'interface', interface: 'interface', '枚举': 'enum', enum: 'enum' };
      const item = {
        name: typeMatch[2], kind: kindMap[typeMatch[1]], line, character: nameIndex,
        offset: offsets[line] + nameIndex, signature: originalLines[line].trim(), container: ''
      };
      symbols.push(item);
      if (item.kind !== 'library') currentType = { name: item.name, depth: lineStartDepth + 1 };
    } else if (currentType && lineStartDepth === currentType.depth) {
      const methodMatch = source.match(methodPattern);
      if (methodMatch && !CONTROL_WORDS.has(methodMatch[2])) {
        const nameIndex = source.indexOf(methodMatch[2], methodMatch.index);
        symbols.push({
          name: methodMatch[2], kind: 'method', line, character: nameIndex,
          offset: offsets[line] + nameIndex, signature: originalLines[line].trim(), container: currentType.name,
          returnType: methodMatch[1] ? methodMatch[1].replace(/\s/g, '') : ''
        });
      } else {
        const fieldMatch = source.match(fieldPattern);
        if (fieldMatch) {
          const nameIndex = source.indexOf(fieldMatch[2], fieldMatch.index);
          symbols.push({
            name: fieldMatch[2], kind: 'field', line, character: nameIndex,
            offset: offsets[line] + nameIndex, signature: originalLines[line].trim(), container: currentType.name,
            returnType: fieldMatch[1].replace(/\s/g, '')
          });
        }
      }
    }
    for (const ch of source) {
      if (ch === '{') depth += 1;
      else if (ch === '}') depth = Math.max(0, depth - 1);
    }
    if (currentType && depth < currentType.depth) currentType = null;
  }
  return symbols;
}

function validate(text) {
  const diagnostics = [];
  const stack = [];
  const pairs = { ')': '(', ']': '[', '}': '{' };
  let line = 0; let column = 0; let i = 0; let blockDepth = 0; let blockStart = null;
  let quote = null; let quoteStart = null;
  const advance = (ch) => { if (ch === '\n') { line += 1; column = 0; } else column += 1; };
  while (i < text.length) {
    const ch = text[i]; const next = text[i + 1];
    if (blockDepth > 0) {
      if (ch === '/' && next === '*') { blockDepth += 1; advance(ch); advance(next); i += 2; continue; }
      if (ch === '*' && next === '/') { blockDepth -= 1; advance(ch); advance(next); i += 2; continue; }
      advance(ch); i += 1; continue;
    }
    if (quote) {
      if (ch === '\\' && i + 1 < text.length) { advance(ch); advance(next); i += 2; continue; }
      if (ch === quote) { quote = null; quoteStart = null; }
      if (ch === '\n' && quote) {
        diagnostics.push({ ...quoteStart, endLine: quoteStart.line, endColumn: quoteStart.column + 1, message: '字符串未在行尾前闭合' });
        quote = null; quoteStart = null;
      }
      advance(ch); i += 1; continue;
    }
    if (ch === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') { advance(text[i]); i += 1; }
      continue;
    }
    if (ch === '/' && next === '*') { blockDepth = 1; blockStart = { line, column }; advance(ch); advance(next); i += 2; continue; }
    if (ch === '"' || ch === "'") { quote = ch; quoteStart = { line, column }; advance(ch); i += 1; continue; }
    if (ch === '(' || ch === '[' || ch === '{') stack.push({ ch, line, column });
    else if (pairs[ch]) {
      if (!stack.length || stack[stack.length - 1].ch !== pairs[ch]) {
        diagnostics.push({ line, column, endLine: line, endColumn: column + 1, message: `没有匹配的“${ch}”` });
      } else stack.pop();
    }
    advance(ch); i += 1;
  }
  if (blockDepth > 0 && blockStart) diagnostics.push({ ...blockStart, endLine: blockStart.line, endColumn: blockStart.column + 2, message: '块注释未闭合' });
  if (quote && quoteStart) diagnostics.push({ ...quoteStart, endLine: quoteStart.line, endColumn: quoteStart.column + 1, message: '字符串未闭合' });
  for (const open of stack) diagnostics.push({ line: open.line, column: open.column, endLine: open.line, endColumn: open.column + 1, message: `“${open.ch}”未闭合` });
  return diagnostics;
}

module.exports = { KEYWORDS, BUILTIN_TYPES, MODIFIERS, sanitize, parseSymbols, validate };
