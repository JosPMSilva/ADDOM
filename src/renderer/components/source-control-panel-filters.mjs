import {
  describeSourceControlEntry,
  describeSourceControlEntryForScope,
} from '../store/useSourceControlStore.js'

export function getFilterCount(groupedEntries, filterId = 'all') {
  switch (String(filterId || 'all').trim().toLowerCase()) {
    case 'staged':
      return groupedEntries.staged.length
    case 'unstaged':
      return groupedEntries.unstaged.length
    case 'conflicted':
      return groupedEntries.conflicted.length
    case 'untracked':
      return groupedEntries.untracked.length
    default:
      return groupedEntries.staged.length + groupedEntries.unstaged.length
  }
}

export function matchesEntrySearch(entry, searchTerm = '', scope = 'unstaged') {
  const normalizedSearch = String(searchTerm || '').trim().toLowerCase()
  if (!normalizedSearch) return true
  const haystack = [
    entry?.projectRelativePath,
    entry?.previousProjectRelativePath,
    describeSourceControlEntry(entry),
    describeSourceControlEntryForScope(entry, scope),
  ]
    .filter(Boolean)
    .join('\n')
    .toLowerCase()
  return haystack.includes(normalizedSearch)
}
