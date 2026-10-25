// Public-repo guard: fails on leaked local/credential data, on files that escape
// the .gitignore allowlist, on unparsable JSON, and on dangling local doc links.
//
//   npm run check
//
// Exit code 1 means "do not publish". Run it before every release tag or push
// to a public remote; .github/workflows/ci.yml runs it too.
import { execFileSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const skipDirs = new Set(['.git', 'node_modules', 'dist', 'workspace', '.qxqy-guid-sync-backups']);

/** Patterns that must never reach a public repository. Keep this list specific
 *  to this project: a generic loopback proxy or a fixture ID is fine to publish,
 *  the maintainer's own paths, accounts and ports are not. */
const rules = [
  { id: 'local-absolute-path', re: /(?<![A-Za-z])[A-Za-z]:[\\/][A-Za-z0-9._\\/-]{2,}/g, hint: '本机绝对路径' },
  { id: 'home-directory', re: /\/(?:Users|home)\/[A-Za-z0-9._-]+\//g, hint: '用户主目录路径' },
  { id: 'windows-user-profile', re: /\bAppData\b/gi, hint: 'Windows 用户目录' },
  { id: 'maintainer-email', re: /530551426@qq\.com/gi, hint: '维护者私人邮箱' },
  { id: 'maintainer-account', re: /\bxcr_1\b/g, hint: '本机系统账号' },
  { id: 'local-proxy-port', re: /\b7897\b/g, hint: '本机代理端口' },
  { id: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g, hint: '私钥' },
  { id: 'github-token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, hint: 'GitHub 令牌' },
  { id: 'api-key', re: /\b(?:sk|ak)-[A-Za-z0-9]{20,}/g, hint: 'API 密钥' },
  { id: 'bearer-token', re: /\bBearer\s+[A-Za-z0-9._~+/-]{16,}/g, hint: 'Bearer 凭据' },
  { id: 'secret-assignment', re: /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token)\s*[=:]\s*["'][^"'\s]{8,}["']/gi, hint: '硬编码密钥' },
];

function globToRegExp(pattern) {
  let out = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '*' && pattern[i + 1] === '*') { out += '.*'; i += 1; }
    else if (ch === '*') out += '[^/]*';
    else if (ch === '?') out += '[^/]';
    else out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${out}$`);
}

/** The .gitignore is an allowlist: it starts with "*" and re-includes the paths
 *  that are safe to publish. Unknown files stay private by default. */
async function allowlistMatchers() {
  const text = await readFile(join(root, '.gitignore'), 'utf8');
  return text.split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('!/'))
    .map(line => line.slice(2))
    .map(pattern => {
      if (pattern.endsWith('/**')) return { prefix: `${pattern.slice(0, -3)}/` };
      if (pattern.endsWith('/')) return { prefix: pattern };
      return { re: globToRegExp(pattern) };
    });
}

const isAllowed = (file, matchers) =>
  matchers.some(({ prefix, re }) => (prefix ? file.startsWith(prefix) : re.test(file)));

async function walk(dir, prefix = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      out.push(...await walk(join(dir, entry.name), rel));
    } else {
      out.push(rel);
    }
  }
  return out;
}

/** What would actually be committed: git's view when available, else the allowlist. */
async function publishSet(matchers) {
  try {
    const listed = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    return [...new Set(listed.split('\0').filter(Boolean))].sort();
  } catch {
    return (await walk(root)).filter(file => isAllowed(file, matchers)).sort();
  }
}

const isBinary = buffer => buffer.subarray(0, 8000).includes(0);
const isText = file => /\.(?:md|json|mjs|js|lua|toml|yml|yaml|txt|gitignore|gitattributes|proto|html|css)$/i.test(file)
  || ['LICENSE', '.gitignore', '.gitattributes'].includes(file);

const problems = [];
const fail = (file, message) => problems.push(`${file}: ${message}`);

const matchers = await allowlistMatchers();
const files = await publishSet(matchers);

if (files.length === 0) problems.push('(publish set) 没有任何待发布文件，检查 .gitignore 白名单');

for (const file of files) {
  if (!isAllowed(file, matchers)) {
    fail(file, '不在 .gitignore 白名单内，却会进入提交；请改为私有或显式加入白名单');
    continue;
  }
  const buffer = await readFile(join(root, file));
  if (isBinary(buffer) || !isText(file)) continue;

  const text = buffer.toString('utf8');
  const lines = text.split(/\r?\n/);
  for (const rule of rules) {
    lines.forEach((line, index) => {
      rule.re.lastIndex = 0;
      const match = rule.re.exec(line);
      if (match) fail(file, `${index + 1}: ${rule.hint} -> ${match[0]} (${rule.id})`);
    });
  }

  if (file.endsWith('.json')) {
    try { JSON.parse(text); } catch (error) { fail(file, `JSON 无法解析：${error.message}`); }
  }

  if (file.endsWith('.md')) {
    for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      if (/^(?:[a-z]+:|#|\/\/)/i.test(target)) continue;
      const clean = target.split('#')[0];
      if (!clean) continue;
      const resolved = resolve(dirname(join(root, file)), decodeURI(clean));
      try {
        await stat(resolved);
      } catch {
        fail(file, `文档链接指向不存在的路径：${target}`);
      }
    }
  }
}

// Every npm script must point at a file that exists, so a fresh clone can run docs.
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
  for (const [, target] of command.matchAll(/(?:^|\s)((?:tools|scripts|examples)\/[^\s&|]+)/g)) {
    try {
      await stat(join(root, target));
    } catch {
      fail('package.json', `scripts.${name} 引用了不存在的文件：${target}`);
    }
  }
}

if (problems.length > 0) {
  console.error(`公开审计失败（${problems.length} 项）：`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

console.log(`公开审计通过：${files.length} 个文件，无本机路径/账号/凭据泄漏，JSON 与文档链接有效。`);
console.log(`  扫描规则：${rules.map(rule => rule.id).join(', ')}`);
