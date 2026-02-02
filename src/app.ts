import { Hono } from 'hono'
import { cors } from 'hono/cors'

const app = new Hono()

// --- Header Spoofing Logic ---
const getBypassHeaders = (url: URL) => {
  const hostname = url.hostname.toLowerCase();
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Referer': url.origin + '/',
  };

  if (hostname.includes('megacloud') || hostname.includes('vidcloud')) {
    headers['Referer'] = 'https://megacloud.tv/';
    headers['Origin'] = 'https://megacloud.tv';
  } else if (hostname.includes('vidstreaming')) {
    headers['Referer'] = 'https://vidstreaming.io/';
  } else if (hostname.match(/hd-\d+/)) {
    headers['Referer'] = `${url.protocol}//${hostname}/`;
  }
  return headers;
}

// --- Proxy Logic ---
const handleRequest = async (c: any) => {
  const targetUrl = c.req.query('url');
  if (!targetUrl) return c.text('Proxy Active. Usage: ?url=LINK', 200);

  const path = new URL(c.req.url).pathname;
  const host = c.req.header('host');
  const proxyBase = `https://${host}${path.includes('m3u8') ? '/m3u8-proxy' : ''}`;

  try {
    const url = new URL(targetUrl);
    const response = await fetch(targetUrl, { headers: getBypassHeaders(url) });

    const contentType = response.headers.get('content-type') || '';
    
    // M3U8 Rewriting
    if (targetUrl.includes('.m3u8') || contentType.includes('mpegurl')) {
      let text = await response.text();
      const basePath = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1);
      
      const rewritten = text.split('\n').map(line => {
        if (!line.trim() || line.startsWith('#')) {
            if (line.includes('URI=')) {
                return line.replace(/URI="([^"]+)"/, (_, uri) => {
                    const abs = uri.startsWith('http') ? uri : new URL(uri, basePath).toString();
                    return `URI="${proxyBase}?url=${encodeURIComponent(abs)}"`;
                });
            }
            return line;
        }
        const absUrl = line.startsWith('http') ? line : new URL(line, basePath).toString();
        return `${proxyBase}?url=${encodeURIComponent(absUrl)}`;
      }).join('\n');

      return c.text(rewritten, 200, { 'Content-Type': 'application/vnd.apple.mpegurl', 'Access-Control-Allow-Origin': '*' });
    }

    return new Response(response.body, {
      status: response.status,
      headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': contentType }
    });
  } catch (e) { return c.text('Error', 500); }
}

app.use('*', cors({ origin: '*' }))
app.all('/', handleRequest)
app.all('/proxy', handleRequest)
app.all('/m3u8-proxy', handleRequest)

export default app
