import React from 'react'
import { SettingsSectionHeaderContext } from './settings-section-context.mjs'

export default function SettingsSection({ title = '', description = '', children }) {
  const showHeader = React.useContext(SettingsSectionHeaderContext) !== false
  return (
    <section className="flex flex-col gap-2">
      {showHeader && (title || description) && (
        <div className="flex flex-col gap-1">
          {title && <h3 className="flex items-center gap-2 font-display text-[13px] font-semibold tracking-normal text-text-primary">{title}</h3>}
          {description && <p className="text-[11px] leading-4 text-text-secondary">{description}</p>}
        </div>
      )}
      {children}
    </section>
  )
}
