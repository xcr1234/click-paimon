#!/usr/bin/env node

// Codex MCP adapter for the six HTTP tools exposed by dsh-plugin-miliastra-toolbox.
// Source contract: https://github.com/1475505/dsh-plugin-miliastra-toolbox (f35d55c).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { fetch, EnvHttpProxyAgent } from 'undici';
import { z } from 'zod/v4';

const baseUrl = (process.env.MILIASTRA_KNOWLEDGE_BASE_URL || 'https://ugc.070077.xyz').replace(/\/+$/, '');
const dispatcher = new EnvHttpProxyAgent();
const server = new McpServer({ name: 'miliastra-toolbox', version: '0.1.0' });
const queryList = z.array(z.string().trim().min(1)).min(1);
const optionalKeywords = z.array(z.string().trim().min(1)).optional();

async function callKnowledgeApi(name, body) {
  const response = await fetch(`${baseUrl}/api/v1/skills/miliastra-knowledge/tools/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    dispatcher,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const envelope = await response.json();
  if (!envelope.success) {
    const detail = typeof envelope.error === 'string' ? envelope.error : JSON.stringify(envelope.error);
    throw new Error(`${name}: ${detail || 'request rejected'}`);
  }
  return envelope.data?.result ?? null;
}

function register(name, description, inputSchema, makeBody) {
  server.registerTool(name, { description, inputSchema }, async (args) => {
    try {
      const value = await callKnowledgeApi(name, makeBody(args));
      return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: String(error) }] };
    }
  });
}

register(
  'get_node_info',
  '按节点名称查询千星奇域节点图节点的功能、参数、归属端和来源文档；支持批量查询。组件和概念请用文档工具。',
  { names: queryList },
  ({ names }) => ({ names }),
);
register(
  'list_documents',
  '列出服务端节点、系统、指南、教程及 FAQ 的文档标题；省略 keywords 可浏览全部文档。',
  { keywords: optionalKeywords },
  ({ keywords }) => keywords === undefined ? {} : { keywords },
);
register(
  'get_document',
  '按标题或关键词获取服务端官方文档全文；支持批量，命中太多时返回候选标题。',
  { titles: queryList },
  ({ titles }) => ({ titles }),
);
register(
  'rag_search',
  '对服务端知识库做自然语言语义检索，适合开放问题和排障；已知节点或文档名时优先使用结构化工具。',
  { queries: queryList, top_k: z.number().int().min(1).max(20).optional() },
  ({ queries, top_k }) => top_k === undefined ? { queries } : { queries, top_k },
);
register(
  'list_client_documents',
  '列出 2D 与 Lua 客户端控件及脚本文档标题；省略 keywords 可浏览全部客户端文档。',
  { keywords: optionalKeywords },
  ({ keywords }) => keywords === undefined ? {} : { keywords },
);
register(
  'get_client_document',
  '按标题或关键词获取 2D 与 Lua 客户端控件及脚本文档全文；支持批量。',
  { titles: queryList },
  ({ titles }) => ({ titles }),
);

await server.connect(new StdioServerTransport());
