'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const { parseProject, createMakefile } = require('../src/project');

const projectPath = path.resolve(process.argv[2] || '');
const compiler = path.resolve(process.argv[3] || 'C:/Program Files (x86)/dywt/ef/bin/efc.exe');
if (!fs.existsSync(projectPath)) throw new Error(`Project not found: ${projectPath}`);
if (!fs.existsSync(compiler)) throw new Error(`Compiler not found: ${compiler}`);

const xml = fs.readFileSync(projectPath, 'utf8').replace(/^\uFEFF/, '');
const project = parseProject(xml, projectPath);
const temporaryOutput = path.join(os.tmpdir(), `ef-vscode-integration-${process.pid}.exe`);
project.output = temporaryOutput;
const infoFiles = fs.readdirSync(project.directory)
  .filter(name => name.toLowerCase().endsWith('.inf'))
  .map(name => path.join(project.directory, name));
const makefilePath = path.join(os.tmpdir(), `ef-vscode-integration-${process.pid}.makefile`);
fs.writeFileSync(makefilePath, `\uFEFF${createMakefile(project, { debug: true, infoFiles })}`, 'utf8');
const result = childProcess.spawnSync(compiler, [`-makefile=${makefilePath}`], {
  // efc 1.00 discovers ../libs relative to this working directory rather than
  // relative to the executable path.
  cwd: path.dirname(path.dirname(compiler)),
  env: {
    ...process.env,
    EF_LIB_PATHS: [path.join(path.dirname(path.dirname(compiler)), 'libs'), path.join(path.dirname(path.dirname(compiler)), 'mylibs')].join(path.delimiter)
  },
  windowsHide: true, encoding: 'buffer'
});
const decode = buffer => {
  try { return new TextDecoder('gb18030').decode(buffer || Buffer.alloc(0)); }
  catch (_) { return (buffer || Buffer.alloc(0)).toString('utf8'); }
};
process.stdout.write(decode(result.stdout));
process.stderr.write(decode(result.stderr));
if (fs.existsSync(temporaryOutput)) fs.unlinkSync(temporaryOutput);
if (fs.existsSync(makefilePath)) fs.unlinkSync(makefilePath);
process.exitCode = result.status || 0;
