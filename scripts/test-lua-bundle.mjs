import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import fengari from 'fengari';
import { bundleLua } from '../tools/bundle-lua.mjs';

const { lua, lauxlib, lualib, to_luastring, to_jsstring } = fengari;

async function fixture(t, files) {
  const dir = await mkdtemp(join(tmpdir(), 'qxqy-lua-bundle-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const root = join(dir, 'src');
  const out = join(dir, 'dist', 'main.lua');
  for (const [name, source] of Object.entries(files)) {
    const file = join(root, name);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, source);
  }
  return { root, out, entry: 'main' };
}

function execute(code, assertions) {
  const state = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(state);
  const run = source => {
    const status = lauxlib.luaL_dostring(state, to_luastring(source));
    assert.equal(status, lua.LUA_OK, status === lua.LUA_OK ? undefined : to_jsstring(lua.lua_tostring(state, -1)));
    lua.lua_settop(state, 0);
  };
  try {
    run('require=nil; package=nil; load=nil; loadfile=nil; dofile=nil; io=nil; os=nil');
    run(code);
    run(assertions);
  } finally {
    lua.lua_close(state);
  }
}

test('single file runs without host loaders, caches nested modules, exposes lifecycle callbacks', async t => {
  const options = await fixture(t, {
    'main.lua': 'local a = require("game.score")\nlocal b = require "game.score"\nassert(a == b)\nfunction OnStart() a.add(3) end\nfunction OnUpdate(dt) a.add(dt) end\nfunction OnDestroy() a.reset() end\nfunction GetScore() return b.get() end',
    'game/score.lua': 'local config = require("config")\ninitializations = (initializations or 0) + 1\nlocal n = config.initial\nlocal M = {}\nfunction M.add(v) n = n + v end\nfunction M.get() return n end\nfunction M.reset() n = 0 end\nreturn M',
    'config.lua': 'return { initial = 1 }',
  });
  const result = await bundleLua(options);
  assert.equal(result.moduleCount, 3);
  execute(await readFile(options.out, 'utf8'), 'assert(initializations == 1); OnStart(); OnUpdate(2); assert(GetScore() == 6); OnDestroy(); assert(GetScore() == 0)');
});

test('ignores require text in comments/strings and preserves source line mapping', async t => {
  const source = `-- require("missing")\n--[==[ require("missing") ]==]\nlocal text = [=[require("missing")]=]\nlocal quoted = "require(\\\"missing\\\")"\nlocal value = require -- note\n ("value")\nfunction GetText() return text .. value end\n`;
  const options = await fixture(t, { 'main.lua': source, 'value.lua': 'return " ok"' });
  const result = await bundleLua(options);
  assert.equal(result.moduleCount, 2);
  execute(result.code, `assert(GetText() == 'require("missing") ok')`);
  const map = JSON.parse(await readFile(`${options.out}.map.json`, 'utf8'));
  const module = map.modules.find(row => row.module === 'main');
  assert.equal(result.code.split('\n').slice(module.startLine - 1, module.endLine).join('\n'), source);
});

test('preserves lazy loading and isolates locals with the same name', async t => {
  const options = await fixture(t, {
    'main.lua': 'local value = "entry"\nfunction OnStart() local m = require("lazy"); assert(m == "lazy"); assert(value == "entry") end',
    'lazy.lua': 'local value = "lazy"\ninitialized = true\nreturn value',
  });
  const result = await bundleLua(options);
  execute(result.code, 'assert(initialized == nil); OnStart(); assert(initialized == true)');
});

test('module initialization happens once for nil and false exports', async t => {
  const options = await fixture(t, {
    'main.lua': 'assert(require("empty") == true); assert(require("empty") == true); assert(require("disabled") == false); assert(require("disabled") == false)',
    'empty.lua': 'emptyCount = (emptyCount or 0) + 1',
    'disabled.lua': 'disabledCount = (disabledCount or 0) + 1; return false',
  });
  const result = await bundleLua(options);
  execute(result.code, 'assert(emptyCount == 1 and disabledCount == 1)');
});

test('rejects missing modules and cycles with the dependency chain', async t => {
  const missing = await fixture(t, { 'main.lua': 'require("missing")' });
  await assert.rejects(bundleLua(missing), /Missing Lua module "missing".*required by main/);
  const cycle = await fixture(t, { 'main.lua': 'require("a")', 'a.lua': 'require("main")' });
  await assert.rejects(bundleLua(cycle), /main -> a -> main/);
});

test('rejects dynamic/aliased/shadowed require and unsafe module names', async t => {
  for (const source of [
    'local name = "a"; require(name)',
    'local import = require; import("a")',
    'local require = function() end',
    'require("../escape")',
    'require [[a]]',
    'require("a", "b")',
  ]) {
    const options = await fixture(t, { 'main.lua': source });
    await assert.rejects(bundleLua(options), /literal require/);
  }
});

test('Lua syntax errors identify the source and do not overwrite the previous build', async t => {
  const options = await fixture(t, { 'main.lua': 'return 1' });
  const original = await bundleLua(options);
  await writeFile(join(options.root, 'main.lua'), 'local broken =');
  await assert.rejects(bundleLua(options), /main.lua:1:/);
  assert.equal(await readFile(options.out, 'utf8'), original.code);
});

test('build is deterministic and cannot overwrite the source tree', async t => {
  const options = await fixture(t, { 'main.lua': 'return require("value")', 'value.lua': 'return 42' });
  const first = await bundleLua(options);
  const second = await bundleLua(options);
  assert.equal(first.code, second.code);
  assert.deepEqual(first.map, second.map);
  await assert.rejects(bundleLua({ ...options, out: join(options.root, 'main.lua') }), /outside the Lua source root/);
  assert.equal(await readFile(join(options.root, 'main.lua'), 'utf8'), 'return require("value")');
});
