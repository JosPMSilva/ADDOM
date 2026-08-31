export function createGitCommandOps(dependencies = {}) {
  const {
    clampInt,
    normalizeCommitMessage,
    normalizeRef,
    normalizeRepoPath,
    normalizeRepoPaths,
    normalizeNewlines,
    runGit,
  } = dependencies

  return {
    async gitStatus(projectRoot, input = {}) {
      const short = input?.short !== false
      const showUntracked = input?.show_untracked !== false
      const repoPath = normalizeRepoPath(projectRoot, input?.path || '.')
      const args = ['status']
      if (short) args.push('--short', '--branch')
      if (!showUntracked) args.push('--untracked-files=no')
      if (repoPath !== '.') args.push('--', repoPath)

      const run = await runGit(projectRoot, args, 'status')
      if (!run.ok) return run.error
      const output = String(run.stdout || '').trim()
      return output || 'Working tree clean.'
    },

    async gitDiff(projectRoot, input = {}) {
      const staged = !!input?.staged
      const contextLines = clampInt(input?.context_lines, 0, 10, 3)
      const repoPath = normalizeRepoPath(projectRoot, input?.path || '.')
      const args = ['diff', `--unified=${contextLines}`]
      if (staged) args.push('--staged')
      if (repoPath !== '.') args.push('--', repoPath)

      const run = await runGit(projectRoot, args, 'diff')
      if (!run.ok) return run.error
      const output = String(run.stdout || '').trim()
      return output || 'No diff.'
    },

    async gitLog(projectRoot, input = {}) {
      const maxCount = clampInt(input?.max_count, 1, 50, 20)
      const repoPath = normalizeRepoPath(projectRoot, input?.path || '.')
      const args = [
        'log',
        `--max-count=${maxCount}`,
        '--date=short',
        '--pretty=format:%h %ad %s (%an)',
      ]
      if (repoPath !== '.') args.push('--', repoPath)

      const run = await runGit(projectRoot, args, 'log')
      if (!run.ok) return run.error
      const output = String(run.stdout || '').trim()
      return output || 'No commits found.'
    },

    async commitGitStaged(projectRoot, input = {}) {
      const message = normalizeCommitMessage(input?.message)
      const commitRun = await runGit(projectRoot, ['commit', '-m', message], 'commit')
      if (!commitRun.ok) {
        const errorText = String(commitRun.error || '')
        if (/nothing to commit|no changes added to commit/i.test(errorText)) {
          return {
            ok: false,
            error: 'no_staged_changes',
            message: 'Stage changes before committing.',
          }
        }
        return {
          ok: false,
          error: 'git_commit_failed',
          message: errorText,
        }
      }

      const summaryRun = await runGit(
        projectRoot,
        ['log', '--max-count=1', '--date=short', '--pretty=format:%H%n%h %ad %s (%an)'],
        'log',
      )
      const summaryLines = summaryRun.ok
        ? normalizeNewlines(String(summaryRun.stdout || '')).split('\n').filter(Boolean)
        : []
      return {
        ok: true,
        status: 'ok',
        commitOid: String(summaryLines[0] || '').trim(),
        summary: String(summaryLines[1] || '').trim(),
        message,
      }
    },

    async gitCommit(projectRoot, input = {}) {
      const message = normalizeCommitMessage(input?.message)
      const addAll = !!input?.add_all
      const paths = normalizeRepoPaths(projectRoot, input?.paths)

      if (addAll) {
        const addAllRun = await runGit(projectRoot, ['add', '--all'], 'add')
        if (!addAllRun.ok) return addAllRun.error
      } else if (paths.length > 0) {
        const addPathsRun = await runGit(projectRoot, ['add', '--', ...paths], 'add')
        if (!addPathsRun.ok) return addPathsRun.error
      }

      const commitRun = await runGit(projectRoot, ['commit', '-m', message], 'commit')
      if (!commitRun.ok) {
        if (/nothing to commit|no changes added to commit/i.test(String(commitRun.error || ''))) {
          return 'No changes to commit.'
        }
        return commitRun.error
      }

      const summaryRun = await runGit(
        projectRoot,
        ['log', '--max-count=1', '--date=short', '--pretty=format:%h %ad %s (%an)'],
        'log',
      )
      const summary = summaryRun.ok ? String(summaryRun.stdout || '').trim() : ''
      return summary ? `Commit created.\n${summary}` : 'Commit created.'
    },

    async gitCheckoutFile(projectRoot, input = {}) {
      const repoPath = normalizeRepoPath(projectRoot, input?.path || '')
      if (!repoPath || repoPath === '.') {
        throw new Error('A file path is required.')
      }
      const ref = normalizeRef(input?.ref || 'HEAD')

      const restoreRun = await runGit(
        projectRoot,
        ['restore', `--source=${ref}`, '--', repoPath],
        'restore',
      )
      if (!restoreRun.ok) {
        const checkoutRun = await runGit(
          projectRoot,
          ['checkout', ref, '--', repoPath],
          'checkout',
        )
        if (!checkoutRun.ok) return restoreRun.error
      }

      const statusRun = await runGit(projectRoot, ['status', '--short', '--', repoPath], 'status')
      const status = statusRun.ok ? String(statusRun.stdout || '').trim() : ''
      if (status) {
        return `Restored "${repoPath}" from ${ref}.\n${status}`
      }
      return `Restored "${repoPath}" from ${ref}.`
    },
  }
}
