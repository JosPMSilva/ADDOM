import test from 'node:test'
import assert from 'node:assert/strict'

import {
  formatDateTime,
  formatDurationMs,
  formatNumber,
  formatRelativeCalendarDate,
  formatRelativeTime,
} from '../../src/renderer/i18n/formatters.mjs'

const DAY_MS = 24 * 60 * 60 * 1_000

test('formatDateTime honors the requested locale instead of forcing English display formats', () => {
  const timestamp = Date.UTC(2026, 3, 2, 15, 4, 0)
  const options = { dateStyle: 'short', timeStyle: 'short' }

  assert.equal(
    formatDateTime(timestamp, { locale: 'en', fallback: '-', ...options }),
    new Intl.DateTimeFormat('en', options).format(new Date(timestamp)),
  )

  assert.equal(
    formatDateTime(timestamp, { locale: 'pt-BR', fallback: '-', ...options }),
    new Intl.DateTimeFormat('pt-BR', options).format(new Date(timestamp)),
  )
})

test('formatRelativeTime delegates to locale-aware relative time formatting', () => {
  const now = Date.UTC(2026, 3, 2, 12, 0, 0)

  assert.equal(
    formatRelativeTime(now - 60_000, { locale: 'en', now, style: 'short', numeric: 'auto' }),
    new Intl.RelativeTimeFormat('en', { style: 'short', numeric: 'auto' }).format(-1, 'minute'),
  )

  assert.equal(
    formatRelativeTime(now - DAY_MS, { locale: 'es', now, style: 'long', numeric: 'auto' }),
    new Intl.RelativeTimeFormat('es', { style: 'long', numeric: 'auto' }).format(-1, 'day'),
  )
})

test('formatRelativeCalendarDate switches from relative day labels to locale-aware dates', () => {
  const now = Date.UTC(2026, 3, 8, 12, 0, 0)

  assert.equal(
    formatRelativeCalendarDate(now - DAY_MS, {
      locale: 'en',
      now,
      maxRelativeDays: 6,
      relativeStyle: 'short',
      numeric: 'auto',
      month: 'short',
      day: 'numeric',
    }),
    new Intl.RelativeTimeFormat('en', { style: 'short', numeric: 'auto' }).format(-1, 'day'),
  )

  assert.equal(
    formatRelativeCalendarDate(now - (10 * DAY_MS), {
      locale: 'pt-BR',
      now,
      maxRelativeDays: 6,
      month: 'short',
      day: 'numeric',
    }),
    new Intl.DateTimeFormat('pt-BR', { month: 'short', day: 'numeric' }).format(new Date(now - (10 * DAY_MS))),
  )
})

test('formatNumber and formatDurationMs use locale-aware number formatting helpers', () => {
  assert.equal(
    formatNumber(12_345.67, { locale: 'es', maximumFractionDigits: 1 }),
    new Intl.NumberFormat('es', { maximumFractionDigits: 1 }).format(12_345.67),
  )

  const expectedDuration = [
    new Intl.NumberFormat('pt-BR', { style: 'unit', unit: 'hour', unitDisplay: 'narrow' }).format(1),
    new Intl.NumberFormat('pt-BR', { style: 'unit', unit: 'minute', unitDisplay: 'narrow' }).format(1),
    new Intl.NumberFormat('pt-BR', { style: 'unit', unit: 'second', unitDisplay: 'narrow' }).format(1),
  ].join(' ')

  assert.equal(
    formatDurationMs(3_661_000, { locale: 'pt-BR' }),
    expectedDuration,
  )
})
