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

function encodeXmlAttribute(value) {
  return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function pathKey(value) {
  return path.resolve(value).replace(/[\\/]+/g, path.sep).toLowerCase();
}

function isInside(directory, file) {
  const relative = path.relative(directory, file);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function syncProjectSourceFiles(xml, projectPath, diskFiles) {
  const directory = path.dirname(projectPath);
  const desiredFiles = new Map();
  for (const file of diskFiles.map(file => path.resolve(file)).filter(file => isInside(directory, file))) {
    desiredFiles.set(pathKey(file), file);
  }
  const desired = [...desiredFiles.keys()].sort((left, right) => left.localeCompare(right));
  const desiredSet = new Set(desired);
  const existing = new Set();
  const removed = [];
  const sourceLinePattern = /^[ \t]*<source-file\b([^>]*?)(?:\/>|>\s*<\/source-file>)[ \t]*(?:\r?\n|$)/gim;
  let updated = xml.replace(sourceLinePattern, (whole, attributes) => {
    const file = parseAttributes(attributes).file;
    if (!file) return whole;
    const absolute = path.resolve(directory, file.replace(/[\\/]+/g, path.sep));
    const key = pathKey(absolute);
    existing.add(key);
    if (isInside(directory, absolute) && !desiredSet.has(key)) {
      removed.push(absolute);
      return '';
    }
    return whole;
  });
  const added = desired.filter(file => !existing.has(file)).map(file => desiredFiles.get(file));
  if (!added.length) return { xml: updated, added: [], removed };
  const section = updated.match(/<source-files\b[^>]*>[\s\S]*?<\/source-files>/i);
  if (!section) throw new Error('.efp 中没有找到 <source-files> 节点。');
  const eol = updated.includes('\r\n') ? '\r\n' : '\n';
  const indentMatch = section[0].match(/^([ \t]*)<source-file\b/m);
  const closingIndent = section[0].match(/^([ \t]*)<\/source-files>/m)?.[1] || '    ';
  const indent = indentMatch?.[1] || `${closingIndent}    `;
  const lines = added.map(file => {
    const relative = path.relative(directory, file).replace(/\//g, '\\');
    return `${indent}<source-file file="${encodeXmlAttribute(relative)}" />${eol}`;
  }).join('');
  updated = updated.replace(/^([ \t]*)<\/source-files>/im, `${lines}$1</source-files>`);
  return { xml: updated, added, removed };
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

module.exports = { decodeXml, parseAttributes, parseProject, syncProjectSourceFiles, quoteMakefileToken, createMakefile };
