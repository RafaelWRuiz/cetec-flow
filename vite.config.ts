import { existsSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { resolve } from 'node:path'
import { Buffer } from 'node:buffer'
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'

const API_PREFIX = '/api/'

const jsonError = (message: string, status = 500) => new Response(JSON.stringify({ error: message }), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8' },
})

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

function toHeaders(request: IncomingMessage) {
  const headers = new Headers()
  Object.entries(request.headers).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((entry) => headers.append(key, entry))
    else if (value !== undefined) headers.set(key, value)
  })
  return headers
}

async function sendResponse(response: Response, serverResponse: ServerResponse) {
  serverResponse.statusCode = response.status
  response.headers.forEach((value, key) => serverResponse.setHeader(key, value))
  serverResponse.end(Buffer.from(await response.arrayBuffer()))
}

function localApiPlugin(serverEnv: Record<string, string>): Plugin {
  const registerMiddleware = (
    server: ViteDevServer,
    middlewares: { use: (handler: (request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void) => void | Promise<void>) => void },
  ) => {
    middlewares.use(async (request: IncomingMessage, response: ServerResponse, next: (error?: unknown) => void) => {
      const requestUrl = request.url ? new URL(request.url, `http://${request.headers.host ?? 'localhost'}`) : null
      if (!requestUrl?.pathname.startsWith(API_PREFIX)) return next()

      const modulePath = `${requestUrl.pathname}.ts`
      const absoluteModulePath = resolve(server.config.root, `.${modulePath}`)
      if (!existsSync(absoluteModulePath)) return next()

      try {
        Object.assign(process.env, serverEnv)
        const loaded = await server.ssrLoadModule(modulePath)
        const handler = loaded.default as ((request: Request) => Promise<Response>) | undefined
        if (!handler) {
          await sendResponse(jsonError(`Handler ausente em ${modulePath}.`, 500), response)
          return
        }

        const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await readBody(request)
        const forwardedRequest = new Request(requestUrl, {
          method: request.method,
          headers: toHeaders(request),
          body: body?.length ? body : undefined,
        })
        await sendResponse(await handler(forwardedRequest), response)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro interno ao executar a API local.'
        await sendResponse(jsonError(message, 500), response)
      }
    })
  }

  return {
    name: 'local-api-plugin',
    configureServer(server) {
      registerMiddleware(server, server.middlewares)
    },
  }
}

export default defineConfig(({ mode }) => {
  const localEnv = loadEnv(mode, process.cwd(), '')
  const serverEnv = Object.fromEntries(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'CETEC_IMPORT_PASSWORD'].flatMap((key) => localEnv[key] ? [[key, localEnv[key]]] : []))

  return {
    plugins: [react(), localApiPlugin(serverEnv)],
  }
})
