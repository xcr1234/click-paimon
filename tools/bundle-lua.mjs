import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import fengari from 'fengari';

const { lua, lauxlib, to_luastring, to_jsstring } = fengari;
const modulePattern = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const inside = (root, path) => {
  const rel = relative(root, path);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
};

function checkSyntax(source, name) {
  const state = lauxlib.luaL_newstate();
  try {
    const bytes = to_luastring(source);
    if (lauxlib.luaL_loadbuffer(state, bytes, bytes.length, to_luastring(`@${name}`)) !== lua.LUA_OK) {
      throw new Error(to_jsstring(lua.lua_tostring(state, -1)));
    }
  } finally {
    lua.lua_close(state);
  }
}

// Tokenize comments and strings before examining require; text inside them is inert.
function tokens(source, name) {
  const result = [];
  let offset = 0;
  let line = 1;
  const advance = end => {
    line += (source.slice(offset, end).match(/\n/g) || []).length;
    offset = end;
  };
  const longEnd = start => {
    const opening = /^\[(=*)\[/.exec(source.slice(start));
    if (!opening) return null;
    const closing = `]${opening[1]}]`;
    const end = source.indexOf(closing, start + opening[0].length);
    if (end < 0) throw new Error(`${name}:${line}: unterminated long string/comment`);
    return end + closing.length;
  };
  while (offset < source.length) {
    const rest = source.slice(offset);
    if (/^\s/.test(rest)) { advance(offset + 1); continue; }
    if (rest.startsWith('--')) {
      const end = longEnd(offset + 2);
      const newline = source.indexOf('\n', offset);
      advance(end ?? (newline < 0 ? source.length : newline));
      continue;
    }
    const start = offset;
    const startLine = line;
    const quote = source[offset];
    if (quote === '"' || quote === "'") {
      let end = offset + 1;
      while (end < source.length && source[end] !== quote) {
        end += source[end] === '\\' ? 2 : 1;
      }
      if (end >= source.length) throw new Error(`${name}:${line}: unterminated string`);
      advance(end + 1);
      result.push({ kind: 'string', value: source.slice(start + 1, end), line: startLine });
      continue;
    }
    const end = quote === '[' ? longEnd(offset) : null;
    if (end !== null) {
      advance(end);
      result.push({ kind: 'long-string', value: source.slice(start, end), line: startLine });
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest)?.[0];
    const value = word ?? (/^\.{2,3}/.exec(rest)?.[0] || quote);
    advance(offset + value.length);
    result.push({ kind: word ? 'identifier' : 'symbol', value, line: startLine });
  }
  return result;
}

function dependencies(source, name) {
  const lexemes = tokens(source, name);
  const found = new Set();
  for (let i = 0; i < lexemes.length; i++) {
    const token = lexemes[i];
    if (token.kind !== 'identifier' || token.value !== 'require') continue;
    const previous = lexemes[i - 1]?.value;
    if (previous === '.' || previous === ':') continue;
    const parenthesized = lexemes[i + 1]?.value === '(';
    const argument = lexemes[i + (parenthesized ? 2 : 1)];
    if (argument?.kind !== 'string' || !modulePattern.test(argument.value)
      || (parenthesized && lexemes[i + 3]?.value !== ')')) {
      throw new Error(`${name}:${token.line}: use a literal require("folder.module"); dynamic/aliased/shadowed require is unsupported`);
    }
    found.add(argument.value);
  }
  return [...found];
}

/** Bundle a static module graph as Lua source, without executing game code. */
export async function bundleLua({ root, entry = 'main', out }) {
  if (!root || !out) throw new Error('Both --root and --out are required');
  if (!modulePattern.test(entry)) throw new Error(`Invalid entry module: ${entry}`);
  const sourceRoot = await realpath(resolve(root));
  const output = resolve(out);
  // Keep generated Lua outside sourceRoot, including when its parent is a symlink.
  let existingParent = dirname(output);
  for (;;) {
    try {
      const actualParent = await realpath(existingParent);
      const actualOutput = resolve(actualParent, relative(existingParent, output));
      if (inside(sourceRoot, actualOutput)) throw new Error('Output must be outside the Lua source root');
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const parent = dirname(existingParent);
      if (parent === existingParent) throw error;
      existingParent = parent;
    }
  }
  const modules = new Map();
  const active = [];
  const visit = async id => {
    if (active.includes(id)) throw new Error(`Circular Lua dependency: ${[...active, id].join(' -> ')}`);
    if (modules.has(id)) return;
    const file = `${id.replaceAll('.', '/')}.lua`;
    let actual;
    try { actual = await realpath(resolve(sourceRoot, file)); }
    catch (error) { throw new Error(`Missing Lua module "${id}" (${file}), required by ${active.at(-1) ?? 'entry'}`, { cause: error }); }
    if (!inside(sourceRoot, actual)) throw new Error(`Lua module escapes source root: ${file}`);
    const source = (await readFile(actual, 'utf8')).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    checkSyntax(source, file);
    const deps = dependencies(source, file);
    active.push(id);
    for (const dependency of deps) await visit(dependency);
    active.pop();
    modules.set(id, { file, source, dependencies: deps });
  };
  await visit(entry);

  const lines = [
    '-- Generated by bundle-lua.mjs. Edit the modular sources, then rebuild.',
    '-- Self-contained Lua source: no package, load, loadfile, or host require needed.',
    'local __qx_factories, __qx_cache, __qx_loaded = {}, {}, {}',
    'local function __qx_require(id)',
    '  if __qx_loaded[id] then return __qx_cache[id] end',
    '  local factory = __qx_factories[id]',
    '  if factory == nil then error("Missing bundled module: " .. id) end',
    '  local value = factory(__qx_require, id)',
    '  if value == nil then value = true end',
    '  __qx_cache[id], __qx_loaded[id] = value, true',
    '  return value',
    'end',
  ];
  const mappings = [];
  // Stable output independent of filesystem traversal order or checkout location.
  for (const [id, module] of [...modules.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
    lines.push(`-- Module: ${module.file}`, `__qx_factories["${id}"] = function(require, ...)`);
    const startLine = lines.length + 1;
    const sourceLines = module.source.split('\n');
    lines.push(...sourceLines, 'end');
    mappings.push({ module: id, source: module.file, startLine, endLine: startLine + sourceLines.length - 1, sourceStartLine: 1 });
  }
  lines.push(`return __qx_require("${entry}")`, '');
  const code = lines.join('\n');
  checkSyntax(code, 'bundle.lua');
  const map = { version: 1, entry, modules: mappings };
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, code, 'utf8');
  await writeFile(`${output}.map.json`, `${JSON.stringify(map, null, 2)}\n`, 'utf8');
  return { output, moduleCount: modules.size, code, map };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--help') {
      console.log('node tools/bundle-lua.mjs --root <src-dir> --entry main --out <dist/main.lua>');
    } else {
      const options = {};
      for (let i = 0; i < args.length; i += 2) {
        if (!['--root', '--entry', '--out'].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith('--')) {
          throw new Error('Expected --root <src-dir> --entry <module> --out <file.lua>');
        }
        options[args[i].slice(2)] = args[i + 1];
      }
      const result = await bundleLua(options);
      console.log(`Bundled ${result.moduleCount} Lua modules -> ${result.output}`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
