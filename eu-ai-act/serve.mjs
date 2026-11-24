import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {Readable} from 'node:stream';
import {extname} from 'node:path';
import handler from '../api/answer.mjs';

const host = '127.0.0.1';
const port = Number(process.env.EU_AI_ACT_PORT || 8080);
const root = new URL('../public/eu-ai-act/', import.meta.url);
const contentTypes = {'.html': 'text/html', '.css': 'text/css', '.json': 'application/json', '.mjs': 'text/javascript'};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${host}:${port}`);
    if (url.pathname === '/api/answer') {
      const options = {method: req.method, headers: req.headers};
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        options.body = Readable.toWeb(req);
        options.duplex = 'half';
      }
      const response = await handler.fetch(new Request(url, options));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      return res.end(Buffer.from(await response.arrayBuffer()));
    }
    const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    if (!/^[a-z][a-z0-9.-]*\.(?:html|css|json|mjs)$/.test(name) || req.method !== 'GET') {
      res.writeHead(404);
      return res.end();
    }
    const content = await readFile(new URL(name, root));
    res.writeHead(200, {'Content-Type': contentTypes[extname(name)] + '; charset=utf-8'});
    res.end(content);
  } catch (error) {
    res.writeHead(error.code === 'ENOENT' ? 404 : 500);
    res.end();
  }
}).listen(port, host, () => console.log(`Research Desk listening at http://${host}:${port}/`));
