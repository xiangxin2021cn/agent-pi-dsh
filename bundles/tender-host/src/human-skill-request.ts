import type { IncomingMessage } from 'node:http'

/** The skill publication route accepts browser-originated JSON, not form/no-CORS posts. */
export function assertHumanSkillRequest(req: Pick<IncomingMessage, 'headers' | 'socket'>): void {
  const contentType = req.headers['content-type'], origin = req.headers.origin, site = req.headers['sec-fetch-site'], host = req.headers.host
  if (typeof contentType !== 'string' || !/^application\/json(?:\s*;|\s*$)/i.test(contentType)) throw new Error('技能人工操作只接受 application/json 请求。')
  if (site === 'cross-site' || site === 'same-site') throw new Error('技能人工操作拒绝跨站请求。')
  if (typeof host !== 'string' || !host) throw new Error('技能人工操作缺少实际请求地址。')
  const protocol = (req.socket as IncomingMessage['socket'] & { encrypted?: boolean }).encrypted ? 'https:' : 'http:'
  let expected: string
  try { expected = new URL(`${protocol}//${host}`).origin } catch { throw new Error('技能人工操作的请求地址非法。') }
  if (!origin) {
    if (site !== 'same-origin') throw new Error('技能人工操作缺少同源浏览器凭据。')
    return
  }
  if (typeof origin !== 'string' || origin !== expected) throw new Error('技能人工操作的来源与当前应用不同。')
}
