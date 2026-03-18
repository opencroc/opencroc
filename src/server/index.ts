import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { registerProjectRoutes } from './routes/project.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerStudioRoutes } from './routes/studio.js';
import { CrocOffice } from './croc-office.js';
import { FileStudioSnapshotStore } from './studio-store.js';
import { FeishuProgressBridge } from './feishu-bridge.js';
import { FeishuApiDelivery } from './feishu-delivery.js';
import { registerFeishuIngressRoutes } from './feishu-ingress.js';
import { registerFeishuSmokeRoutes } from './feishu-smoke.js';
import type { OpenCrocConfig } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface ServeOptions {
  port: number;
  host: string;
  open: boolean;
  config: OpenCrocConfig;
  cwd: string;
}

export async function startServer(opts: ServeOptions): Promise<void> {
  const app = Fastify({ logger: false });

  // --- WebSocket ---
  await app.register(fastifyWebsocket);

  // --- Static frontend assets ---
  const webDir = resolve(__dirname, '../web');
  const builtIndexPath = join(webDir, 'dist', 'index.html');

  function hasBuiltStudio(): boolean {
    return existsSync(builtIndexPath);
  }

  function sendSpaEntry(reply: { sendFile: (path: string) => unknown; code: (status: number) => any; header: (key: string, value: string) => any; send: (body: string) => unknown; }) {
    if (hasBuiltStudio()) {
      return reply.sendFile('dist/index.html');
    }

    return reply.code(200).header('content-type', 'text/html').send(getEmbeddedHtml());
  }

  function isAssetRequest(url: string): boolean {
    return /\.[a-z0-9]+$/i.test(url) || url.startsWith('/dist/');
  }

  if (existsSync(webDir)) {
    await app.register(fastifyStatic, {
      root: webDir,
      prefix: '/',
      index: false,
    });
  }

  // --- Croc Office (Agent orchestrator) ---
  const office = new CrocOffice(opts.config, opts.cwd);
  const snapshotStore = new FileStudioSnapshotStore(resolve(opts.cwd, '.opencroc/studio-snapshot.json'));
  const feishuConfig = {
    ...(opts.config.feishu ?? {}),
    baseTaskUrl: opts.config.feishu?.baseTaskUrl ?? `http://${opts.host === '0.0.0.0' ? 'localhost' : opts.host}:${opts.port}`,
    enabled: opts.config.feishu?.enabled ?? true,
    progressThrottlePercent: opts.config.feishu?.progressThrottlePercent,
  };
  const feishuBridge = new FeishuProgressBridge(new FeishuApiDelivery(feishuConfig), feishuConfig);
  office.setFeishuBridge(feishuBridge);

  // --- REST API routes ---
  registerProjectRoutes(app, office);
  registerAgentRoutes(app, office);
  registerStudioRoutes(app, office, snapshotStore);
  registerFeishuIngressRoutes(app, office, feishuBridge);
  registerFeishuSmokeRoutes(app, office);

  // --- WebSocket endpoint for real-time updates ---
  app.register(async (fastify) => {
    fastify.get('/ws', { websocket: true }, (socket) => {
      office.addClient(socket);
      socket.on('close', () => office.removeClient(socket));
    });
  });

  app.get('/index-studio.html', (_req, reply) => {
    reply.redirect('/studio');
  });

  app.get('/index-v2-pixel.html', (_req, reply) => {
    reply.redirect('/pixel');
  });

  app.get('/', (_req, reply) => {
    return sendSpaEntry(reply);
  });

  app.get('/studio', (_req, reply) => {
    return sendSpaEntry(reply);
  });

  app.get('/pixel', (_req, reply) => {
    return sendSpaEntry(reply);
  });

  app.get('/tasks', (_req, reply) => {
    return sendSpaEntry(reply);
  });

  app.get('/tasks/:id', (_req, reply) => {
    return sendSpaEntry(reply);
  });

  // --- SPA fallback: serve index.html for non-API, non-asset routes ---
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/') || req.url.startsWith('/ws') || isAssetRequest(req.url)) {
      reply.code(404).send({ error: 'Not found' });
      return;
    }

    return sendSpaEntry(reply);
  });

  try {
    await app.listen({ port: opts.port, host: opts.host });
    const url = `http://${opts.host === '0.0.0.0' ? 'localhost' : opts.host}:${opts.port}`;
    console.log(`\n  🐊 OpenCroc Studio is running at ${url}\n`);

    if (opts.open) {
      const { exec } = await import('node:child_process');
      const cmd = process.platform === 'win32' ? 'start' :
                  process.platform === 'darwin' ? 'open' : 'xdg-open';
      exec(`${cmd} ${url}`);
    }
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

/** Minimal embedded HTML when no web build is present */
function getEmbeddedHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>OpenCroc Studio 🐊</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#1a1a2e; color:#e0e0e0; font-family:'Courier New',monospace; display:flex; justify-content:center; align-items:center; min-height:100vh; }
  .container { text-align:center; }
  h1 { font-size:3rem; color:#4ecca3; margin-bottom:1rem; }
  .croc { font-size:6rem; animation: bounce 1s infinite alternate; }
  @keyframes bounce { from{transform:translateY(0)} to{transform:translateY(-20px)} }
  p { margin-top:1rem; color:#888; }
  .status { margin-top:2rem; padding:1rem; background:#16213e; border-radius:8px; }
  #graph-container { margin-top:2rem; min-height:400px; background:#0f3460; border-radius:8px; position:relative; }
  .loading { color:#4ecca3; padding:2rem; }
</style>
</head>
<body>
<div class="container">
  <div class="croc">🐊</div>
  <h1>OpenCroc Studio</h1>
  <p>AI-native E2E testing — Pixel Croc Office</p>
  <div class="status" id="status">Connecting...</div>
  <div id="graph-container"><div class="loading">Loading project graph...</div></div>
</div>
<script>
(async () => {
  // Fetch project graph data
  try {
    const res = await fetch('/api/project');
    const data = await res.json();
    document.getElementById('status').innerHTML =
      '<b>Project:</b> ' + (data.name || 'unknown') +
      ' | <b>Modules:</b> ' + (data.stats?.modules || 0) +
      ' | <b>Models:</b> ' + (data.stats?.models || 0) +
      ' | <b>APIs:</b> ' + (data.stats?.endpoints || 0);

    renderGraph(data.graph);
  } catch(e) {
    document.getElementById('status').textContent = 'Error loading project: ' + e.message;
  }

  // WebSocket for live updates
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(protocol + '//' + location.host + '/ws');
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'agent:update') {
        updateAgentStatus(msg.payload);
      } else if (msg.type === 'graph:update') {
        renderGraph(msg.payload);
      }
    } catch {}
  };
  ws.onclose = () => {
    document.getElementById('status').textContent += ' [disconnected]';
  };
})();

function renderGraph(graph) {
  if (!graph || (!graph.nodes?.length)) {
    document.getElementById('graph-container').innerHTML = '<div class="loading">No modules found. Run opencroc init first.</div>';
    return;
  }

  const container = document.getElementById('graph-container');
  const w = container.clientWidth || 800;
  const h = 500;

  // Simple force-directed placement
  const nodes = graph.nodes.map((n, i) => ({
    ...n,
    x: w/2 + Math.cos(i * 2 * Math.PI / graph.nodes.length) * Math.min(w,h) * 0.35,
    y: h/2 + Math.sin(i * 2 * Math.PI / graph.nodes.length) * Math.min(w,h) * 0.35,
    vx: 0, vy: 0,
  }));

  const nodeMap = new Map(nodes.map(n => [n.id, n]));

  // Render SVG
  const colors = { model:'#4ecca3', controller:'#e94560', api:'#f39c12', dto:'#3498db', default:'#888' };

  let svg = '<svg width="'+w+'" height="'+h+'" xmlns="http://www.w3.org/2000/svg">';

  // Edges
  for (const edge of (graph.edges || [])) {
    const s = nodeMap.get(edge.source);
    const t = nodeMap.get(edge.target);
    if (s && t) {
      svg += '<line x1="'+s.x+'" y1="'+s.y+'" x2="'+t.x+'" y2="'+t.y+'" stroke="#555" stroke-width="1.5" opacity="0.6"/>';
    }
  }

  // Nodes
  for (const n of nodes) {
    const color = colors[n.type] || colors.default;
    const statusColor = n.status === 'passed' ? '#4ecca3' : n.status === 'failed' ? '#e94560' : n.status === 'testing' ? '#f39c12' : '#555';
    // Pixel-art style square nodes
    svg += '<rect x="'+(n.x-16)+'" y="'+(n.y-16)+'" width="32" height="32" fill="'+color+'" rx="4" stroke="'+statusColor+'" stroke-width="2"/>';
    svg += '<text x="'+n.x+'" y="'+(n.y+32)+'" text-anchor="middle" fill="#ccc" font-size="10" font-family="Courier New">'+escapeHtml(n.label || n.id)+'</text>';
  }

  svg += '</svg>';
  container.innerHTML = svg;
}

function escapeHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function updateAgentStatus(agents) {
  // Will be enhanced with pixel croc animations in M2
  console.log('Agent update:', agents);
}
</script>
</body>
</html>`;
}
