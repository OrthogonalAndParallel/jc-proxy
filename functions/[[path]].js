export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // 1. 打印原始请求路径
  console.log("Original Path:", path);

  if (path === "/" || path === "") {
    return new Response("Proxy is active.");
  }

  // 转换路径
  const rawPath = path.replace("/blob/", "/");
  const targetUrl = `https://raw.githubusercontent.com${rawPath}`;
  
  // 2. 打印转换后的 GitHub URL
  console.log("Target GitHub URL:", targetUrl);

  try {
    const response = await fetch(targetUrl, {
      method: request.method,
      headers: {
        "User-Agent": "Cloudflare-Pages-Proxy",
        "Host": "raw.githubusercontent.com"
      },
      redirect: "follow"
    });

    // 3. 打印 GitHub 返回的状态码
    console.log("GitHub Response Status:", response.status);

    // 如果状态码不是 200，直接返回错误信息协助调试
    if (response.status !== 200) {
      return new Response(`GitHub Error: ${response.status} at ${targetUrl}`, { status: response.status });
    }

    const content = await response.text();
    
    // 4. 打印内容长度，如果是 0，说明 GitHub 没给数据
    console.log("Content Length:", content.length);

    if (content.length === 0) {
      return new Response("Warning: GitHub returned empty content", { status: 200 });
    }

    return new Response(content, {
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "text/plain",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache" // 调试期间禁用缓存
      }
    });

  } catch (err) {
    console.log("Fetch Error:", err.message);
    return new Response("Proxy Error: " + err.message, { status: 500 });
  }
}