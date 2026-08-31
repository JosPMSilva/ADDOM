import React from 'react'

export default function AddomTextLogoSimple({ height = 40, className = '' }) {
    const width = height * 4.6
    return (
        <svg
            width={width}
            height={height}
            viewBox="0 0 460 100"
            className={className}
            xmlns="http://www.w3.org/2000/svg"
            style={{ display: 'block', flexShrink: 0, color: 'var(--color-accent-strong)' }}
        >
            <path
                fillRule="evenodd"
                clipRule="evenodd"
                fill="currentColor"
                d="M 14 14 H 86 V 86 H 68 V 62 H 32 V 86 H 14 Z M 32 30 H 68 V 48 H 32 Z M 110 14 H 159 L 177 32 V 68 L 159 86 H 110 Z M 128 30 H 147 L 159 42 V 58 L 147 70 H 128 Z M 195 14 H 244 L 262 32 V 68 L 244 86 H 195 Z M 213 30 H 232 L 244 42 V 58 L 232 70 H 213 Z M 298 14 H 334 L 352 32 V 68 L 334 86 H 298 L 280 68 V 32 Z M 310 30 H 322 L 334 42 V 58 L 322 70 H 310 L 298 58 V 42 Z M 370 86 V 14 H 388 L 406 40 L 424 14 H 442 V 86 H 424 V 38 L 406 64 L 388 38 V 86 Z"
            />
        </svg>
    )
}
