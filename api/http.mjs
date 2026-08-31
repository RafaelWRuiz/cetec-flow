import { Buffer } from 'node:buffer'

const hasWebRequestShape = (request) => typeof request.arrayBuffer === 'function'

async function readBody(request) {
  const chunks = []
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  return Buffer.concat(chunks)
}

function headersFor(request) {
  const headers = new Headers()
  Object.entries(request.headers).forEach(([name, value]) => {
    if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry))
    else if (value !== undefined) headers.set(name, value)
  })
  return headers
}

export async function asWebRequest(request) {
  if (hasWebRequestShape(request)) return request

  const host = request.headers.host ?? 'localhost'
  const url = new URL(request.url ?? '/', `https://${host}`)
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await readBody(request)
  return new Request(url, {
    method: request.method ?? 'GET',
    headers: headersFor(request),
    body: body?.length ? body : undefined,
  })
}

export async function sendWebResponse(response, nodeResponse) {
  if (!nodeResponse) return response

  nodeResponse.statusCode = response.status
  response.headers.forEach((value, name) => nodeResponse.setHeader(name, value))
  nodeResponse.end(Buffer.from(await response.arrayBuffer()))
  return response
}
