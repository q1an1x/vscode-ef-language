'use strict';

const path = require('path');

function decodeXml(value) {
  return String(value || '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function tag(xml, name) {
  const match = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? decodeXml(match[1].trim()) : '';
}

function parseAttributes(source) {
  const attrs = {};
  const pattern = /([\w-]+)\s*=\s*(["'])([\s\S]*?)\2/g;
  let match;
  while ((match = pattern.exec(source))) attrs[match[1]] = decodeXml(match[3]);
  return attrs;
}

function parseProject(xml, projectPath) {
  const directory = path.dirname(projectPath);
  const sourceFiles = [];
  const sourcePattern = /<source-file\b([^>]*?)(?:\/>|>\s*<\/source-file>)/gi;
  let match;
  while ((match = sourcePattern.exec(xml))) {
    const file = parseAttributes(match[1]).file;
    if (file) sourceFiles.push(path.resolve(directory, file.replace(/[\\/]+/g, path.sep)));
  }
  return {
    projectPath,
    directory,
    name: tag(xml, 'name') || path.basename(projectPath, path.extname(projectPath)),
    type: tag(xml, 'type') || 'runable',
    output: tag(xml, 'out'),
    libraryName: tag(xml, 'efl-name'),
    mainClass: tag(xml, 'main-class'),
    sourceFiles
  };
}

function quoteMakefileToken(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

function createMakefile(project, options = {}) {
  const lines = [];
  if (options.debug) lines.push('-dbg');
  lines.push(`-out_mode=${project.type || 'runable'}`);
  if (project.output && project.type !== 'efl') lines.push(`-out=${quoteMakefileToken(path.resolve(project.directory, project.output))}`);
  if (project.libraryName) lines.push(`-efl_name=${quoteMakefileToken(project.libraryName)}`);
  if (project.mainClass) lines.push(`-main_class=${quoteMakefileToken(project.mainClass)}`);
  for (const arg of options.extraArguments || []) lines.push(String(arg));
  // efc treats each non-option makefile line as one complete file name, so
  // spaces are valid here and quotes would incorrectly become part of the path.
  for (const file of options.infoFiles || []) lines.push(file);
  for (const file of project.sourceFiles) lines.push(file);
  return `${lines.join('\r\n')}\r\n`;
}

module.exports = { decodeXml, parseAttributes, parseProject, quoteMakefileToken, createMakefile };
