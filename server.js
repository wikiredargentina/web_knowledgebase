import http from 'node:http';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ENV_FILE = path.join(process.cwd(), '.env');
const env = {};
try { const rawEnv = await fs.readFile(ENV_FILE, 'utf8'); for (const line of rawEnv.split(/\r?\n/)) { const m=line.match(/^\s*([A-Za-z_][\w]*)\s*=\s*(.*?)\s*$/); if(m) env[m[1]]=m[2].replace(/^['"]|['"]$/g,''); } } catch {}
if (process.argv[2] === '--hash-password') { const password=process.argv[3]; if(!password){console.error('Uso: npm run hash-password -- "tu contraseña"');process.exit(1)}; const salt=crypto.randomBytes(16).toString('hex'); console.log(`scrypt$${salt}$${crypto.scryptSync(password,salt,64).toString('hex')}`); process.exit(0); }
const ROOT = path.resolve(env.EDITOR_ROOT || process.env.EDITOR_ROOT || process.cwd());
const PORT = Number(process.env.PORT || env.PORT || 3000);
const HOST = process.env.HOST || env.HOST || '127.0.0.1';
const LOGIN_USER = env.USER || '';
const PASSWORD_HASH = env.PASSWORD || '';
const sessions = new Map();
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const TEXT_EXTENSIONS = new Set(['.md','.markdown','.txt','.js','.mjs','.cjs','.ts','.tsx','.jsx','.json','.css','.scss','.html','.htm','.xml','.yaml','.yml','.env','.sh','.bash','.sql','.php','.py','.java','.kt','.go','.rs','.conf','.ini','.toml','.log','.gitignore']);

function safePath(input = '') {
  const relative = decodeURIComponent(input).replace(/^[/\\]+/, '');
  const target = path.resolve(ROOT, relative);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) throw new Error('Ruta fuera de la carpeta raíz');
  return target;
}
function authenticated(req) { const c=req.headers.cookie?.match(/(?:^|; )session=([^;]+)/); return c && sessions.has(c[1]); }
function requireAuth(req,res) { if(authenticated(req)) return true; json(res,401,{error:'Autenticación requerida'}); return false; }
function checkPassword(value) { const m=PASSWORD_HASH.match(/^scrypt\$([^$]+)\$([a-f0-9]+)$/); return !!m && crypto.timingSafeEqual(Buffer.from(m[2],'hex'),crypto.scryptSync(value,m[1],m[2].length/2)); }
function relative(target) { return path.relative(ROOT, target).split(path.sep).join('/'); }
function json(res, code, data) { res.writeHead(code, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'}); res.end(JSON.stringify(data)); }
function contentType(file) { return file.endsWith('.css') ? 'text/css; charset=utf-8' : file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8'; }
function streamMedia(req,res,target,type,size) { const range=req.headers.range; if(!range){res.writeHead(200,{'Content-Type':type,'Content-Length':size,'Accept-Ranges':'bytes','Cache-Control':'no-store'});return createReadStream(target).pipe(res)} const m=range.match(/bytes=(\d*)-(\d*)/);if(!m)return json(res,416,{error:'Rango inválido'});let start=m[1]?Number(m[1]):Math.max(size-Number(m[2]||0),0);const end=m[2]?Math.min(Number(m[2]),size-1):size-1;if(start>end||start>=size)return json(res,416,{error:'Rango fuera de archivo'});res.writeHead(206,{'Content-Type':type,'Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${size}`,'Accept-Ranges':'bytes','Cache-Control':'no-store'});return createReadStream(target,{start,end}).pipe(res); }
async function body(req) { let s=''; for await (const chunk of req) s += chunk; return JSON.parse(s || '{}'); }
async function walk(dir) {
  const entries = await fs.readdir(dir, {withFileTypes:true});
  const result = [];
  for (const entry of entries.sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric:true}))) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const absolute = path.join(dir, entry.name);
    const item = {name: entry.name, path: relative(absolute), type: entry.isDirectory() ? 'directory' : 'file'};
    if (entry.isDirectory()) item.children = await walk(absolute);
    else item.size = (await fs.stat(absolute)).size;
    result.push(item);
  }
  return result;
}
async function serveStatic(req, res) {
  let file = req.url === '/' ? '/index.html' : req.url;
  const base = file.startsWith('/img/') ? path.dirname(PUBLIC) : PUBLIC;
  const target = path.resolve(base, '.' + decodeURIComponent(file.split('?')[0]));
  if (!target.startsWith(base + path.sep)) return json(res, 403, {error:'Acceso denegado'});
  try { const data = await fs.readFile(target); res.writeHead(200, {'Content-Type': contentType(target)}); res.end(data); }
  catch { json(res, 404, {error:'No encontrado'}); }
}
const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/api/session' && req.method === 'GET') return json(res,200,{authenticated:authenticated(req),configured:!!(LOGIN_USER&&PASSWORD_HASH)});
    if (url.pathname === '/api/login' && req.method === 'POST') { const d=await body(req); if(d.user!==LOGIN_USER || !checkPassword(String(d.password||''))) return json(res,401,{error:'Usuario o contraseña incorrectos'}); const token=crypto.randomBytes(32).toString('hex'); sessions.set(token,Date.now()+8*60*60*1000); res.writeHead(200,{'Content-Type':'application/json','Set-Cookie':`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800`}); return res.end(JSON.stringify({ok:true})); }
    if (url.pathname === '/api/logout' && req.method === 'POST') { const c=req.headers.cookie?.match(/(?:^|; )session=([^;]+)/); if(c)sessions.delete(c[1]); res.writeHead(200,{'Set-Cookie':'session=; HttpOnly; Path=/; Max-Age=0','Content-Type':'application/json'}); return res.end('{"ok":true}'); }
    if (url.pathname.startsWith('/api/') && !requireAuth(req,res)) return;
    if (url.pathname === '/api/tree' && req.method === 'GET') return json(res, 200, {root:ROOT, tree:await walk(ROOT)});
    if (url.pathname === '/api/file' && req.method === 'GET') {
      const target = safePath(url.searchParams.get('path') || '');
      const stat = await fs.stat(target);
      if (!stat.isFile()) return json(res, 400, {error:'No es un archivo'});
      const ext = path.extname(target).toLowerCase();
      if (!TEXT_EXTENSIONS.has(ext) && !path.basename(target).startsWith('.')) return json(res, 415, {error:'Solo se pueden editar archivos de texto'});
      return json(res, 200, {path:relative(target), content:await fs.readFile(target,'utf8'), size:stat.size, modified:stat.mtime});
    }
    if (url.pathname === '/api/media' && req.method === 'GET') { const target=safePath(url.searchParams.get('path')); const stat=await fs.stat(target); if(!stat.isFile())return json(res,400,{error:'No es un archivo'}); const ext=path.extname(target).toLowerCase(); const types={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml','.bmp':'image/bmp','.ico':'image/x-icon','.pdf':'application/pdf','.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.m4a':'audio/mp4','.aac':'audio/aac','.flac':'audio/flac','.mp4':'video/mp4','.webm':'video/webm','.mov':'video/quicktime','.avi':'video/x-msvideo','.mkv':'video/x-matroska'}; if(!types[ext])return json(res,415,{error:'Formato no compatible'}); return streamMedia(req,res,target,types[ext],stat.size); }
    if (url.pathname === '/api/file' && req.method === 'PUT') {
      const data = await body(req); const target = safePath(data.path);
      const stat = await fs.stat(target); if (!stat.isFile()) return json(res,400,{error:'No es un archivo'});
      await fs.writeFile(target, String(data.content ?? ''), 'utf8');
      return json(res, 200, {ok:true, path:relative(target), modified:(await fs.stat(target)).mtime});
    }
    if (url.pathname === '/api/download' && req.method === 'GET') { const target=safePath(url.searchParams.get('path')); const stat=await fs.stat(target); if(!stat.isFile()) return json(res,400,{error:'No es un archivo'}); res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${path.basename(target).replace(/"/g,'')}"`}); return createReadStream(target).pipe(res); }
    if (url.pathname === '/api/upload' && req.method === 'POST') { const dir=safePath(url.searchParams.get('dir')||''); const name=path.basename(req.headers['x-file-name']||'archivo.txt'); const target=safePath(path.join(relative(dir),name)); await fs.mkdir(dir,{recursive:true}); const chunks=[]; for await(const c of req)chunks.push(c); await fs.writeFile(target,Buffer.concat(chunks)); return json(res,200,{ok:true,path:relative(target)}); }
    if (url.pathname === '/api/item' && req.method === 'POST') { const d=await body(req); const parent=safePath(d.parent||''); const name=path.basename(String(d.name||'')); if(d.action==='move'){const old=safePath(d.path);if(old===ROOT)return json(res,400,{error:'No se puede mover la raíz'});if(parent===old||parent.startsWith(old+path.sep))return json(res,400,{error:'No se puede mover una carpeta dentro de sí misma'});const target=safePath(path.join(relative(parent),path.basename(old)));await fs.rename(old,target);return json(res,200,{ok:true,path:relative(target)})} if(!name||name==='.'||name==='..') return json(res,400,{error:'Nombre inválido'}); const target=safePath(path.join(relative(parent),name)); if(d.action==='create-file') await fs.writeFile(target,'','utf8'); else if(d.action==='create-folder') await fs.mkdir(target); else if(d.action==='rename'){const old=safePath(d.path); await fs.rename(old,target)} else return json(res,400,{error:'Acción inválida'}); return json(res,200,{ok:true}); }
    if (url.pathname === '/api/item' && req.method === 'DELETE') { const target=safePath(url.searchParams.get('path')); if(target===ROOT)return json(res,400,{error:'No se puede eliminar la raíz'}); await fs.rm(target,{recursive:true,force:false}); return json(res,200,{ok:true}); }
    return serveStatic(req,res);
  } catch (error) { json(res, error.code === 'ENOENT' ? 404 : 400, {error:error.message || 'Error inesperado'}); }
});
server.listen(PORT, HOST, () => console.log(`Root File Editor: http://${HOST}:${PORT} | raíz: ${ROOT}`));
