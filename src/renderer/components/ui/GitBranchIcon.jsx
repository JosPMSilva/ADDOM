import React from 'react'

export default function GitBranchIcon({ className = 'h-4 w-4' }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <path d="M4 4.5v7" />
      <path d="M12 4.5v.75A2.75 2.75 0 0 1 9.25 8H4" />
      <circle cx="4" cy="3" r="1.5" />
      <circle cx="4" cy="13" r="1.5" />
      <circle cx="12" cy="3" r="1.5" />
    </svg>
  )
}
