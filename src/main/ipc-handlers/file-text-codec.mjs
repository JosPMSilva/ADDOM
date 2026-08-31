function hasUtf8Bom(buffer) {
  return buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
}

function hasUtf16LeBom(buffer) {
  return buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe
}

function hasUtf16BeBom(buffer) {
  return buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff
}

function stripLeadingBom(text = '') {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function swapUtf16ByteOrder(buffer) {
  const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '')
  const swapped = Buffer.alloc(source.length)
  for (let i = 0; i < source.length; i += 2) {
    swapped[i] = source[i + 1] ?? 0
    swapped[i + 1] = source[i] ?? 0
  }
  return swapped
}

function looksLikeUtf16(buffer) {
  if (!buffer.length) return false
  let nulCount = 0
  for (let i = 0; i < buffer.length; i += 1) {
    if (buffer[i] === 0) nulCount += 1
  }
  return (nulCount / buffer.length) >= 0.15
}

export function detectTextEncodingFromBuffer(buffer) {
  const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '')
  if (source.length === 0) return 'utf8'
  if (hasUtf8Bom(source)) return 'utf8-bom'
  if (hasUtf16LeBom(source)) return 'utf16le'
  if (hasUtf16BeBom(source)) return 'utf16be'
  if (looksLikeUtf16(source)) return 'utf16le'
  return 'utf8'
}

export function decodeTextFileBuffer(buffer) {
  const source = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '')
  const encoding = detectTextEncodingFromBuffer(source)

  if (encoding === 'utf8-bom') {
    return {
      encoding,
      content: source.subarray(3).toString('utf8'),
    }
  }

  if (encoding === 'utf16le') {
    const body = hasUtf16LeBom(source) ? source.subarray(2) : source
    return {
      encoding,
      content: stripLeadingBom(body.toString('utf16le')),
    }
  }

  if (encoding === 'utf16be') {
    const body = hasUtf16BeBom(source) ? source.subarray(2) : source
    return {
      encoding,
      content: stripLeadingBom(swapUtf16ByteOrder(body).toString('utf16le')),
    }
  }

  return {
    encoding: 'utf8',
    content: source.toString('utf8'),
  }
}

export function encodeTextFileContent(content = '', encoding = 'utf8') {
  const text = String(content ?? '')
  const normalizedEncoding = String(encoding || 'utf8').trim().toLowerCase()

  if (normalizedEncoding === 'utf8-bom') {
    return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')])
  }

  if (normalizedEncoding === 'utf16le') {
    return Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')])
  }

  if (normalizedEncoding === 'utf16be') {
    return Buffer.concat([Buffer.from([0xfe, 0xff]), swapUtf16ByteOrder(Buffer.from(text, 'utf16le'))])
  }

  return Buffer.from(text, 'utf8')
}
