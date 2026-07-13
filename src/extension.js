'use strict';

const vscode = require('vscode');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const childProcess = require('child_process');
const { KEYWORDS, BUILTIN_TYPES, MODIFIERS, parseSymbols, validate } = require('./parser');
const { parseProject, createMakefile } = require('./project');

const selector = [{ language: 'ef', scheme: 'file' }, { language: 'ef', scheme: 'untitled' }];
const output = vscode.window.createOutputChannel('易语言.飞扬');
const syntaxDiagnostics = vscode.languages.createDiagnosticCollection('ef-syntax');
const compilerDiagnostics = vscode.languages.createDiagnosticCollection('ef-compiler');
let activeProjectPath = '';
let lastBuild = null;
let index = [];
let indexPromise = null;

function config(uri) { return vscode.workspace.getConfiguration('ef', uri); }

function decodeBuffer(buffer) {
  for (const encoding of ['gb18030', 'utf-8']) {
    try {
      const text = new TextDecoder(encoding).decode(buffer);
      if (!text.includes('\uFFFD')) return text;
    } catch (_) { /* try next encoding */ }
  }
  return buffer.toString('utf8');
}

async function exists(file) {
  try { await fsp.access(file); return true; } catch (_) { return false; }
}

async function findInstall(uri) {
  const cfg = config(uri);
  const explicitCompiler = cfg.get('compilerPath', '').trim();
  if (explicitCompiler && await exists(explicitCompiler)) {
    const bin = path.dirname(explicitCompiler);
    return { compiler: explicitCompiler, root: path.dirname(bin) };
  }
  const explicitRoot = cfg.get('installRoot', '').trim();
  const roots = [
    explicitRoot,
    process.env.EF_HOME,
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'dywt', 'ef'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'dywt', 'ef')
  ].filter(Boolean);
  for (const root of roots) {
    for (const compiler of [path.join(root, 'bin', 'efc.exe'), path.join(root, 'ef', 'bin', 'efc.exe')]) {
      if (await exists(compiler)) return { compiler, root: compiler.endsWith(path.join('ef', 'bin', 'efc.exe')) ? path.dirname(path.dirname(path.dirname(compiler))) : root };
    }
  }
  return null;
}

async function projectCandidates() {
  return vscode.workspace.findFiles('**/*.efp', '**/{node_modules,.git}/**');
}

async function resolveProject(uri, promptWhenMany = true) {
  if (activeProjectPath && await exists(activeProjectPath)) return activeProjectPath;
  const cfgValue = config(uri).get('projectFile', '').trim();
  if (cfgValue) {
    const folder = uri ? vscode.workspace.getWorkspaceFolder(uri) : vscode.workspace.workspaceFolders?.[0];
    const resolved = path.isAbsolute(cfgValue) ? cfgValue : path.resolve(folder?.uri.fsPath || process.cwd(), cfgValue);
    if (await exists(resolved)) return resolved;
  }
  const candidates = await projectCandidates();
  if (!candidates.length) throw new Error('工作区中没有找到 .efp 工程文件。');
  if (candidates.length === 1 || !promptWhenMany) return candidates[0].fsPath;
  const chosen = await vscode.window.showQuickPick(candidates.map(item => ({
    label: path.basename(item.fsPath), description: vscode.workspace.asRelativePath(item), path: item.fsPath
  })), { placeHolder: '选择活动 EF 工程' });
  if (!chosen) return '';
  activeProjectPath = chosen.path;
  return chosen.path;
}

async function loadProject(uri) {
  const projectPath = await resolveProject(uri);
  if (!projectPath) return null;
  const xml = (await fsp.readFile(projectPath, 'utf8')).replace(/^\uFEFF/, '');
  return parseProject(xml, projectPath);
}

function outputPath(project) {
  if (project.type === 'efl') return path.join(project.directory, `${project.libraryName || project.name}.efl`);
  return path.resolve(project.directory, project.output || `${project.name}.exe`);
}

function efEnvironment(compiler) {
  const efRoot = path.dirname(path.dirname(compiler));
  const paths = [path.join(efRoot, 'libs'), path.join(efRoot, 'mylibs')];
  const existing = process.env.EF_LIB_PATHS;
  if (existing) paths.push(existing);
  return { ...process.env, EF_LIB_PATHS: paths.join(path.delimiter) };
}

function parseCompilerDiagnostics(text, project) {
  compilerDiagnostics.clear();
  const grouped = new Map();
  const nativePattern = /错误\((\d+)\)\((.+?\.ef),\s*(\d+)(?:\s*[,，]\s*(\d+))?\)\s*[：:]\s*(.+)/gi;
  let nativeMatch;
  while ((nativeMatch = nativePattern.exec(text))) {
    const fileText = nativeMatch[2].trim();
    const uri = vscode.Uri.file(path.isAbsolute(fileText) ? fileText : path.resolve(project.directory, fileText));
    const line = Math.max(0, Number(nativeMatch[3]) - 1);
    const column = Math.max(0, Number(nativeMatch[4] || 1) - 1);
    const diagnostic = new vscode.Diagnostic(new vscode.Range(line, column, line, column + 1), nativeMatch[5].trim(), vscode.DiagnosticSeverity.Error);
    diagnostic.code = Number(nativeMatch[1]); diagnostic.source = 'efc';
    const key = uri.toString();
    if (!grouped.has(key)) grouped.set(key, { uri, diagnostics: [] });
    grouped.get(key).diagnostics.push(diagnostic);
  }
  const patterns = [
    /(?:文件[：:]\s*)?([^\r\n<>"|?*]+?\.ef)(?:\((\d+)(?:\s*[,，:]\s*(\d+))?\)|[：:]\s*(\d+)(?:\s*[,，:]\s*(\d+))?)[：:\s]+(.+)/gi,
    /([^\r\n<>"|?*]+?\.ef)\s+第\s*(\d+)\s*行(?:第\s*(\d+)\s*列)?[：:\s]+(.+)/gi
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text))) {
      const second = pattern === patterns[0];
      const fileText = match[1].trim();
      const line = Math.max(0, Number(match[2] || match[4] || 1) - 1);
      const column = Math.max(0, Number(match[3] || match[5] || 1) - 1);
      const message = (second ? match[6] : match[4]).trim();
      let file = path.isAbsolute(fileText) ? fileText : path.resolve(project.directory, fileText);
      const uri = vscode.Uri.file(file);
      const diagnostic = new vscode.Diagnostic(new vscode.Range(line, column, line, column + 1), message, vscode.DiagnosticSeverity.Error);
      diagnostic.source = 'efc';
      const key = uri.toString();
      if (!grouped.has(key)) grouped.set(key, { uri, diagnostics: [] });
      grouped.get(key).diagnostics.push(diagnostic);
    }
  }
  compilerDiagnostics.set([...grouped.values()].map(item => [item.uri, item.diagnostics]));
}

async function build(showSuccess = true) {
  const uri = vscode.window.activeTextEditor?.document.uri;
  const install = await findInstall(uri);
  if (!install) throw new Error('没有找到 efc.exe。请在设置中填写“ef.compilerPath”。');
  const project = await loadProject(uri);
  if (!project) return null;
  const missing = [];
  for (const file of project.sourceFiles) if (!await exists(file)) missing.push(file);
  if (missing.length) throw new Error(`工程引用了不存在的源码：\n${missing.join('\n')}`);
  const infoFiles = (await fsp.readdir(project.directory, { withFileTypes: true }))
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.inf'))
    .map(entry => path.join(project.directory, entry.name));
  const cfg = config(uri);
  const makefile = createMakefile(project, {
    debug: cfg.get('build.debug', true),
    extraArguments: cfg.get('build.extraArguments', []),
    infoFiles
  });
  const hash = crypto.createHash('sha1').update(project.projectPath).digest('hex').slice(0, 12);
  const makefilePath = path.join(os.tmpdir(), `ef-vscode-${hash}.makefile`);
  await fsp.writeFile(makefilePath, `\uFEFF${makefile}`, 'utf8');
  output.show(true);
  output.appendLine(`\n[EF] 编译 ${project.name}`);
  output.appendLine(`[EF] 工程 ${project.projectPath}`);
  output.appendLine(`[EF] 编译器 ${install.compiler}`);
  const result = await new Promise((resolve, reject) => {
    const child = childProcess.spawn(install.compiler, [`-makefile=${makefilePath}`], {
      // efc 1.00 resolves its libs/mylibs folders from the process working
      // directory. Running at the EF root is required outside EFIDE.
      cwd: path.dirname(path.dirname(install.compiler)), env: efEnvironment(install.compiler),
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
    });
    const chunks = []; const errorChunks = [];
    child.stdout.on('data', chunk => chunks.push(chunk));
    child.stderr.on('data', chunk => errorChunks.push(chunk));
    child.on('error', reject);
    child.on('close', code => resolve({ code, stdout: Buffer.concat(chunks), stderr: Buffer.concat(errorChunks) }));
  });
  const text = `${decodeBuffer(result.stdout)}${decodeBuffer(result.stderr)}`.trim();
  if (text) output.appendLine(text);
  parseCompilerDiagnostics(text, project);
  const builtFile = outputPath(project);
  const success = result.code === 0 && await exists(builtFile);
  lastBuild = { project, output: builtFile, success };
  if (!success) throw new Error(`编译失败（退出代码 ${result.code}）。请查看“易语言.飞扬”输出。`);
  output.appendLine(`[EF] 编译完成 ${builtFile}`);
  if (showSuccess) vscode.window.setStatusBarMessage(`$(check) EF 编译完成：${path.basename(builtFile)}`, 5000);
  return lastBuild;
}

async function run(buildFirst = false) {
  let target = lastBuild;
  const currentProject = await resolveProject(vscode.window.activeTextEditor?.document.uri, false);
  if (buildFirst || !target || target.project.projectPath !== currentProject || !await exists(target.output)) target = await build(false);
  if (!target) return;
  const install = await findInstall(vscode.window.activeTextEditor?.document.uri);
  const execution = new vscode.ProcessExecution(target.output, [], {
    cwd: target.project.directory,
    env: install ? { ...process.env, EF_LIB_PATHS: efEnvironment(install.compiler).EF_LIB_PATHS } : process.env
  });
  const task = new vscode.Task(
    { type: 'ef', project: target.project.projectPath },
    vscode.TaskScope.Workspace,
    `运行 ${target.project.name}`,
    'EF',
    execution
  );
  task.presentationOptions = { reveal: vscode.TaskRevealKind.Always, panel: vscode.TaskPanelKind.Dedicated, clear: true };
  await vscode.tasks.executeTask(task);
}

async function refreshIndex() {
  if (indexPromise) return indexPromise;
  indexPromise = (async () => {
    const files = await vscode.workspace.findFiles('**/*.{ef,inf}', '**/{node_modules,.git}/**');
    const entries = [];
    await Promise.all(files.map(async uri => {
      try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        const text = new TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
        for (const symbol of parseSymbols(text)) entries.push({ ...symbol, uri });
      } catch (_) { /* an unreadable file should not break language services */ }
    }));
    index = entries;
    return entries;
  })().finally(() => { indexPromise = null; });
  return indexPromise;
}

function invalidateIndex() { index = []; }

function wordAt(document, position) {
  const range = document.getWordRangeAtPosition(position, /[\p{L}_][\p{L}\p{N}_]*/u);
  return range ? { range, word: document.getText(range) } : null;
}

function symbolKind(kind) {
  return ({ library: vscode.SymbolKind.Namespace, class: vscode.SymbolKind.Class, interface: vscode.SymbolKind.Interface,
    enum: vscode.SymbolKind.Enum, method: vscode.SymbolKind.Method, field: vscode.SymbolKind.Field })[kind] || vscode.SymbolKind.Variable;
}

const documentSymbolProvider = {
  provideDocumentSymbols(document) {
    return parseSymbols(document.getText()).map(item => {
      const line = document.lineAt(item.line);
      const selection = new vscode.Range(item.line, item.character, item.line, item.character + item.name.length);
      return new vscode.DocumentSymbol(item.name, item.signature, symbolKind(item.kind), line.range, selection);
    });
  }
};

const definitionProvider = {
  async provideDefinition(document, position) {
    const current = wordAt(document, position); if (!current) return [];
    await refreshIndex();
    return index.filter(item => item.name === current.word).map(item => new vscode.Location(item.uri, new vscode.Position(item.line, item.character)));
  }
};

const hoverProvider = {
  async provideHover(document, position) {
    const current = wordAt(document, position); if (!current) return null;
    const keyword = KEYWORDS.find(row => row[0] === current.word || row[1] === current.word);
    if (keyword) {
      const markdown = new vscode.MarkdownString();
      markdown.appendCodeblock(`${keyword[0]} / ${keyword[1]}`, 'ef');
      markdown.appendMarkdown(keyword[2]);
      return new vscode.Hover(markdown, current.range);
    }
    await refreshIndex();
    const found = index.find(item => item.name === current.word);
    if (!found) return null;
    const markdown = new vscode.MarkdownString();
    markdown.appendCodeblock(found.signature, 'ef');
    markdown.appendMarkdown(`定义于 **${vscode.workspace.asRelativePath(found.uri)}**`);
    return new vscode.Hover(markdown, current.range);
  }
};

const completionProvider = {
  async provideCompletionItems() {
    await refreshIndex();
    const items = [];
    for (const [cn, en, detail] of KEYWORDS) {
      for (const label of [cn, en].filter(Boolean)) {
        const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Keyword);
        item.detail = `${cn} / ${en}`; item.documentation = detail; items.push(item);
      }
    }
    for (const label of [...BUILTIN_TYPES, ...MODIFIERS]) items.push(new vscode.CompletionItem(label, vscode.CompletionItemKind.Keyword));
    for (const symbol of index) {
      const item = new vscode.CompletionItem(symbol.name, symbol.kind === 'method' ? vscode.CompletionItemKind.Method : vscode.CompletionItemKind.Class);
      item.detail = symbol.signature; items.push(item);
    }
    return items;
  }
};

const referenceProvider = {
  async provideReferences(document, position, context) {
    const current = wordAt(document, position); if (!current) return [];
    const files = await vscode.workspace.findFiles('**/*.{ef,inf}', '**/{node_modules,.git}/**');
    const escaped = current.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'gu');
    const locations = [];
    for (const uri of files) {
      const doc = await vscode.workspace.openTextDocument(uri); const text = doc.getText(); let match;
      while ((match = regex.exec(text))) {
        const start = doc.positionAt(match.index);
        if (!context.includeDeclaration && index.some(item => item.uri.toString() === uri.toString() && item.offset === match.index)) continue;
        locations.push(new vscode.Location(uri, new vscode.Range(start, start.translate(0, current.word.length))));
      }
    }
    return locations;
  }
};

const renameProvider = {
  prepareRename(document, position) {
    const current = wordAt(document, position); if (!current) throw new Error('光标处不是 EF 标识符。');
    return { range: current.range, placeholder: current.word };
  },
  async provideRenameEdits(document, position, newName) {
    if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(newName)) throw new Error('新名称不是合法的 EF 标识符。');
    const locations = await referenceProvider.provideReferences(document, position, { includeDeclaration: true });
    const edit = new vscode.WorkspaceEdit();
    for (const location of locations) edit.replace(location.uri, location.range, newName);
    return edit;
  }
};

function updateSyntaxDiagnostics(document) {
  if (document.languageId !== 'ef' || !config(document.uri).get('diagnostics.onType', true)) return;
  const items = validate(document.getText()).map(item => {
    const diagnostic = new vscode.Diagnostic(new vscode.Range(item.line, item.column, item.endLine, item.endColumn), item.message, vscode.DiagnosticSeverity.Error);
    diagnostic.source = 'EF 结构检查'; return diagnostic;
  });
  syntaxDiagnostics.set(document.uri, items);
}

async function openDocs(kind) {
  const install = await findInstall(vscode.window.activeTextEditor?.document.uri);
  if (!install) throw new Error('没有找到易语言.飞扬安装目录。请设置“ef.installRoot”。');
  const efRoot = path.dirname(path.dirname(install.compiler));
  const file = kind === 'whitebook' ? path.join(efRoot, 'docs', 'whitebook', 'index.html') : path.join(efRoot, 'docs', 'api', 'index.html');
  if (!await exists(file)) throw new Error(`文档不存在：${file}`);
  await vscode.env.openExternal(vscode.Uri.file(file));
}

function guarded(fn) {
  return async (...args) => {
    try { return await fn(...args); }
    catch (error) { output.appendLine(`[EF] ${error.stack || error.message || error}`); vscode.window.showErrorMessage(`EF: ${error.message || error}`); return null; }
  };
}

function activate(context) {
  context.subscriptions.push(output, syntaxDiagnostics, compilerDiagnostics);
  context.subscriptions.push(vscode.languages.registerDocumentSymbolProvider(selector, documentSymbolProvider));
  context.subscriptions.push(vscode.languages.registerDefinitionProvider(selector, definitionProvider));
  context.subscriptions.push(vscode.languages.registerHoverProvider(selector, hoverProvider));
  context.subscriptions.push(vscode.languages.registerCompletionItemProvider(selector, completionProvider, '.', ' '));
  context.subscriptions.push(vscode.languages.registerReferenceProvider(selector, referenceProvider));
  context.subscriptions.push(vscode.languages.registerRenameProvider(selector, renameProvider));
  context.subscriptions.push(vscode.commands.registerCommand('ef.build', guarded(() => build(true))));
  context.subscriptions.push(vscode.commands.registerCommand('ef.run', guarded(() => run(false))));
  context.subscriptions.push(vscode.commands.registerCommand('ef.buildAndRun', guarded(() => run(true))));
  context.subscriptions.push(vscode.commands.registerCommand('ef.selectProject', guarded(async () => {
    activeProjectPath = '';
    const selected = await resolveProject(vscode.window.activeTextEditor?.document.uri, true);
    if (selected) vscode.window.setStatusBarMessage(`EF 活动工程：${path.basename(selected)}`, 5000);
  })));
  context.subscriptions.push(vscode.commands.registerCommand('ef.openWhitebook', guarded(() => openDocs('whitebook'))));
  context.subscriptions.push(vscode.commands.registerCommand('ef.openApiDocs', guarded(() => openDocs('api'))));
  context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
    if (event.document.languageId === 'ef') { invalidateIndex(); updateSyntaxDiagnostics(event.document); }
  }));
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(updateSyntaxDiagnostics));
  context.subscriptions.push(vscode.workspace.onDidDeleteFiles(() => invalidateIndex()));
  context.subscriptions.push(vscode.workspace.onDidCreateFiles(() => invalidateIndex()));
  for (const document of vscode.workspace.textDocuments) updateSyntaxDiagnostics(document);
  refreshIndex();
}

function deactivate() {}

module.exports = { activate, deactivate };
