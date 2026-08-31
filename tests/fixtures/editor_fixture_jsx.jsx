import React from 'react'

export function FixtureCard({ title = 'JSX Fixture' }) {
  return (
    <section className="fixture-card">
      <h2>{title}</h2>
    </section>
  )
}
