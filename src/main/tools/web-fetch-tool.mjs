import {
  DEFAULT_FETCH_TIMEOUT_MS,
  DEFAULT_MAX_RESPONSE_BODY_BYTES,
  DEFAULT_MAX_REDIRECT_HOPS,
  fetchTextWithSafeRedirects,
} from '../utils/ssrf-guard.mjs'
import {
  createWebFetchRateLimiter,
  normalizeWebFetchRequesterKey,
} from './web-fetch-rate-limit.mjs'

const MAX_CONTENT_CHARS = 12_000
const webFetchRateLimiter = createWebFetchRateLimiter({
  capacity: 12,
  refillPerSecond: 0.5,
  staleAfterMs: 120_000,
})

function stripHtml(html) {
  // Remove script / style / nav / header / footer / aside + their contents
  let text = html
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '')
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '')
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '')
  text = text.replace(/<header[\s\S]*?<\/header>/gi, '')
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '')
  text = text.replace(/<aside[\s\S]*?<\/aside>/gi, '')

  // Extract title
  const titleMatch = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : ''

  // Extract meta description
  const metaDescMatch = text.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    || text.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)
  const metaDesc = metaDescMatch ? metaDescMatch[1].trim() : ''

  // Extract links
  const links = []
  const linkRe = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m
  while ((m = linkRe.exec(text)) !== null) {
    const href = m[1].trim()
    const linkText = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      links.push({ href, text: linkText })
    }
  }

  // Extract headings and paragraphs as readable text
  const bodyLines = []
  const contentRe = /<(h[1-3]|p)[^>]*>([\s\S]*?)<\/\1>/gi
  while ((m = contentRe.exec(text)) !== null) {
    const tag = m[1].toLowerCase()
    const content = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    if (!content) continue
    if (tag.startsWith('h')) {
      bodyLines.push(`\n## ${content}\n`)
    } else {
      bodyLines.push(content)
    }
  }

  return { title, metaDesc, bodyLines, links }
}

/**
 * Fetch a web page and return clean readable text.
 * @param {string} _projectRoot - unused (web tool)
 * @param {{ url: string, reason: string }} toolInput
 * @returns {Promise<string>}
 */
export async function fetchPage(_projectRoot, toolInput, options = {}) {
  const requesterKey = normalizeWebFetchRequesterKey(options?.webFetchRequesterKey) || 'global'
  const rateLimit = webFetchRateLimiter.consume(requesterKey)
  if (!rateLimit.ok) {
    const err = new Error(`fetch_page rate limit exceeded. Retry after ${rateLimit.retryAfterMs} ms.`)
    err.code = 'WEB_FETCH_RATE_LIMITED'
    err.retryAfterMs = rateLimit.retryAfterMs
    throw err
  }
  const rawUrl = String(toolInput?.url ?? '').trim()
  const reason = String(toolInput?.reason ?? '').trim()

  if (!rawUrl) throw new Error('url is required')

  const {
    status,
    statusText,
    headers,
    bodyText: rawBody,
    bodyTruncated,
    finalUrl,
    redirectCount,
  } = await fetchTextWithSafeRedirects(rawUrl, {
    timeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
    maxRedirectHops: DEFAULT_MAX_REDIRECT_HOPS,
    maxBodyBytes: DEFAULT_MAX_RESPONSE_BODY_BYTES,
    userAgent: 'ADDOM/1.0 (+https://github.com/anomalyco/Claude)',
    accept: 'text/html,text/plain;q=0.9,*/*;q=0.8',
    acceptLanguage: 'en-US,en;q=0.9',
  })

  if (status < 200 || status >= 300) {
    throw new Error(`HTTP ${status} ${statusText} fetching ${finalUrl}`)
  }

  const contentType = String(headers.get('content-type') || '').toLowerCase()
  if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
    throw new Error(`Unsupported content type: ${contentType} (only text/html and text/plain supported)`)
  }

  let output
  if (contentType.includes('text/html')) {
    const { title, metaDesc, bodyLines, links } = stripHtml(rawBody)
    const parts = []
    parts.push(`URL: ${finalUrl}`)
    if (redirectCount > 0) parts.push(`Redirects followed: ${redirectCount}`)
    if (title) parts.push(`Title: ${title}`)
    if (metaDesc) parts.push(`Description: ${metaDesc}`)
    if (reason) parts.push(`Fetched reason: ${reason}`)
    parts.push('')
    if (bodyLines.length > 0) {
      parts.push(bodyLines.join('\n').replace(/\n{3,}/g, '\n\n').trim())
    }
    if (links.length > 0) {
      parts.push('')
      parts.push('Links:')
      for (const link of links.slice(0, 50)) {
        parts.push(`- ${link.href}${link.text ? ` - ${link.text}` : ''}`)
      }
    }
    output = parts.join('\n')
  } else {
    output = `URL: ${finalUrl}\n${redirectCount > 0 ? `Redirects followed: ${redirectCount}\n` : ''}${reason ? `Fetched reason: ${reason}\n` : ''}\n${rawBody}`
  }

  if (output.length > MAX_CONTENT_CHARS) {
    output = output.slice(0, MAX_CONTENT_CHARS) + '\n\n[Content truncated - page exceeded 12,000 character limit]'
  }
  if (bodyTruncated) {
    output += `\n\n[Response body truncated - exceeded ${DEFAULT_MAX_RESPONSE_BODY_BYTES} byte safety limit]`
  }

  return output
}
