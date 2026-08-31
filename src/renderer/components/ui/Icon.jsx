import React from 'react'

export default function Icon({
    name,
    weight = 'regular', // Currently only regular is loaded, but this matches the class name structure if we add more
    size,
    className = '',
    style,
    ...props
}) {
    const iconName = String(name || '').trim()
    if (!iconName) return null

    const iconWeight = String(weight || 'regular').trim() || 'regular'
    const iconStyle = size == null
        ? style
        : {
            fontSize: typeof size === 'number' ? `${size}px` : size,
            lineHeight: 1,
            ...style,
        }
    // Phosphor's base class is 'ph'. Specific icons use 'ph-<name>'.
    // If we had weights, we might use 'ph-<weight> ph-<name>' or 'ph-<name>-bold'.
    // We'll stick to standard 'ph ph-name' for regular font.
    return (
        <i
            className={[`ph`, `ph-${iconName}`, className].filter(Boolean).join(' ')}
            data-icon-weight={iconWeight}
            aria-hidden="true"
            style={iconStyle}
            {...props}
        />
    )
}
