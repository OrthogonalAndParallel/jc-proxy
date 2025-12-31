// 设置缓存时间（秒），5分钟
const CACHE_TTL_SECONDS = 300;

// 处理 CORS 跨域头
function withCors(headers) {
  headers.set('access-control-allow-origin', '*');
  headers.set('access-control-allow-methods', 'GET,HEAD,OPTIONS');
  headers.set('access-control-allow-headers', '*');
  headers.set('access-control-max-age', '86400');
  return headers;
}

// 辅助函数：生成纯文本响应
function makeTextResponse(body, status = 200, extraHeaders = {}) {
  const headers = new Headers({
    'content-type': 'text/plain; charset=utf-8',
    ...extraHeaders,
  });
  withCors(headers);
  return new Response(body, { status, headers });
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  // 1. 处理预检请求 (CORS)
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: withCors(new Headers()) });
  }

  // 2. 限制请求方法
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return makeTextResponse('Method Not Allowed', 405);
  }

  // 3. 根目录访问提示
  if (url.pathname === '/' || url.pathname === '') {
    return makeTextResponse(
      `GitHub Proxy 运行中\n\n使用方法:\n域名/:owner/:repo/blob/:ref/*path\n\n示例:\n${url.origin}/Guovin/iptv-api/blob/master/output/result.m3u`,
      200
    );
  }

  // 4. 解析路径参数
  // 预期路径格式: /Guovin/iptv-api/blob/master/output/result.m3u
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 5) {
    return makeTextResponse('Invalid URL Format. Use: /:owner/:repo/blob/:ref/:path', 404);
  }

  const [owner, repo, blobKeyword, ref, ...fileParts] = parts;
  
  // 校验是否包含 blob 关键字（模拟 GitHub 网页版链接结构）
  if (blobKeyword !== 'blob') {
    return makeTextResponse('Not Found: Missing "blob" in path', 404);
  }

  const filePath = fileParts.join('/');
  if (!filePath) {
    return makeTextResponse('Not Found: File path is empty', 404);
  }

  // 5. 构建指向 GitHub Raw 的真实地址
  const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${filePath}`;

  // 6. 准备转发请求的请求头
  const upstreamHeaders = new Headers();
  const ua = request.headers.get('user-agent');
  if (ua) upstreamHeaders.set('user-agent', ua);
  
  const accept = request.headers.get('accept');
  if (accept) upstreamHeaders.set('accept', accept);

  const range = request.headers.get('range');
  if (range) upstreamHeaders.set('range', range);

  try {
    // 7. 发起对 GitHub 的请求
    const upstreamResp = await fetch(rawUrl, {
      method: request.method,
      headers: upstreamHeaders,
      redirect: 'follow',
      cf: {
        cacheEverything: true,
        cacheTtl: CACHE_TTL_SECONDS,
      },
    });

    // 8. 复制并处理响应头
    const outHeaders = new Headers(upstreamResp.headers);
    
    // 安全性移除：删除可能存在的 Cookie
    outHeaders.delete('set-cookie');
    outHeaders.delete('set-cookie2');

    // 如果是 m3u 或其他流媒体列表，确保 Content-Type 正确
    if (!outHeaders.has('content-type')) {
      if (filePath.endsWith('.m3u') || filePath.endsWith('.m3u8')) {
        outHeaders.set('content-type', 'application/vnd.apple.mpegurl; charset=utf-8');
      } else {
        outHeaders.set('content-type', 'text/plain; charset=utf-8');
      }
    }

    // 设置缓存控制和自定义标识头
    outHeaders.set('cache-control', `public, max-age=${CACHE_TTL_SECONDS}`);
    outHeaders.set('x-proxy-upstream', 'raw.githubusercontent.com');
    outHeaders.set('x-proxy-raw-url', rawUrl);
    
    // 添加跨域头
    withCors(outHeaders);

    // 9. 返回内容
    return new Response(upstreamResp.body, {
      status: upstreamResp.status,
      statusText: upstreamResp.statusText,
      headers: outHeaders,
    });

  } catch (e) {
    return makeTextResponse(`Upstream fetch failed: ${e.message}`, 502);
  }
}