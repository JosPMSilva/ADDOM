import React from 'react'

export default function AddomTextLogo({ height = 40, className = '' }) {
    // Increased width ratio to accommodate `</> ADDOM`
    const width = height * 7.2
    return (
        <svg
            width={width}
            height={height}
            viewBox="0 0 720 100"
            className={className}
            xmlns="http://www.w3.org/2000/svg"
            style={{ display: 'block', flexShrink: 0, color: 'var(--color-accent-strong)' }}
        >
            <path
                fillRule="evenodd"
                clipRule="evenodd"
                fill="currentColor"
                d="M 64 14 H 82 L 46 50 L 82 86 H 64 L 28 50 Z M 134 14 H 152 L 118 86 H 100 Z M 172 14 H 190 L 226 50 L 190 86 H 172 L 208 50 Z M 266 14 H 338 V 86 H 320 V 62 H 284 V 86 H 266 Z M 284 30 H 320 V 48 H 284 Z M 362 14 H 411 L 429 32 V 68 L 411 86 H 362 Z M 380 30 H 399 L 411 42 V 58 L 399 70 H 380 Z M 447 14 H 496 L 514 32 V 68 L 496 86 H 447 Z M 465 30 H 484 L 496 42 V 58 L 484 70 H 465 Z M 550 14 H 586 L 604 32 V 68 L 586 86 H 550 L 532 68 V 32 Z M 562 30 H 574 L 586 42 V 58 L 574 70 H 562 L 550 58 V 42 Z M 622 86 V 14 H 640 L 658 40 L 676 14 H 694 V 86 H 676 V 38 L 658 64 L 640 38 V 86 Z"
            />
        </svg>
    )
}
