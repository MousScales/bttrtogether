/**
 * Rapyd API request signing for Deno Edge Functions.
 * Signature = BASE64(HMAC-SHA256(http_method + url_path + salt + timestamp + access_key + secret_key + body_string))
 * @see https://docs.rapyd.net/en/request-signatures.html
 */

export function makeRapydRequest(
  method: string,
  path: string,
  body: unknown,
  accessKey: string,
  secretKey: string,
  baseUrl: string
): { headers: Record<string, string>; url: string; body: string } {
  const salt = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const bodyString = body == null || (typeof body === "object" && Object.keys(body as object).length === 0)
    ? ""
    : JSON.stringify(body);
  const toSign = method.toLowerCase() + path + salt + timestamp + accessKey + secretKey + bodyString;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(toSign)
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(sig)));
  const url = `${baseUrl.replace(/\/+$/, "")}${path}`;
  return {
    url,
    body: bodyString,
    headers: {
      "Content-Type": "application/json",
      "access_key": accessKey,
      "salt": salt,
      "timestamp": timestamp,
      "signature": signature,
    },
  };
}

export async function rapydFetch(
  method: string,
  path: string,
  body: unknown,
  accessKey: string,
  secretKey: string,
  baseUrl: string
): Promise<Response> {
  const { url, headers, body: bodyStr } = await makeRapydRequest(method, path, body, accessKey, secretKey, baseUrl);
  return fetch(url, {
    method,
    headers,
    body: method !== "GET" && bodyStr ? bodyStr : undefined,
  });
}
