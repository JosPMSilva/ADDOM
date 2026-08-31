export default function ProviderCustomModelInput({
  activeProvider = null,
  customModelInputEnabled = false,
  customModel = '',
  customModelValue = '',
  onCustomModelChange = () => {},
  onSubmitCustomModel = () => {},
} = {}) {
  if (!activeProvider || !customModelInputEnabled) return null

  return (
    <>
      <input
        type="text"
        value={customModel}
        onChange={(event) => onCustomModelChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          void onSubmitCustomModel(customModelValue)
        }}
        placeholder="Custom model ID"
        className="h-8 w-40 shrink-0 rounded-lg border border-surface-border bg-surface-panel-alt px-2.5 text-[12px] text-text-subtle outline-none transition-colors hover:border-border-hover focus:border-accent"
      />

      {customModelValue && (
        <button
          type="button"
          onClick={() => {
            void onSubmitCustomModel(customModelValue)
          }}
          className="inline-flex h-8 shrink-0 items-center whitespace-nowrap rounded-lg border border-surface-border bg-surface-panel-alt px-2.5 text-[12px] font-medium text-text-secondary transition-colors hover:border-border-hover hover:text-text-primary"
        >
          Use
        </button>
      )}
    </>
  )
}
