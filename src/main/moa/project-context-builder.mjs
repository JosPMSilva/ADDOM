/**
 * project-context-builder.mjs
 *
 * Gathers project metadata to enrich agent prompts with relevant context.
 * Used by the Enhanced Prompt feature (Feature 5) to automatically add
 * project structure, tech stack, and relevant file information before
 * dispatching tasks to MoA agents.
 */

import fs from 'fs'
import path from 'path'

/* ------------------------------------------------------------------ */
/*  File tree builder                                                  */
/* ------------------------------------------------------------------ */

const IGNORE_DIRS = new Set([
    'node_modules', '.git', '.next', 'dist', 'build', 'coverage',
    '.cache', '.turbo', '__pycache__', '.venv', 'venv', '.addom',
    '.vscode', '.idea', '.DS_Store',
])

const IGNORE_EXTENSIONS = new Set([
    '.lock', '.map', '.min.js', '.min.css', '.woff', '.woff2',
    '.ttf', '.eot', '.ico', '.png', '.jpg', '.jpeg', '.gif',
    '.svg', '.mp4', '.webm', '.webp', '.pdf',
])

/**
 * Build a compact file tree string from the project folder.
 * Only scans to a configurable depth to avoid heavy I/O.
 *
 * @param {string} projectFolder
 * @param {{ maxDepth?: number, maxFiles?: number }} options
 * @returns {string} - Indented file tree
 */
export function buildFileTree(projectFolder, { maxDepth = 3, maxFiles = 200 } = {}) {
    if (!projectFolder || !fs.existsSync(projectFolder)) return ''
    const lines = []
    let fileCount = 0

    function walk(dir, depth, prefix) {
        if (depth > maxDepth || fileCount >= maxFiles) return
        let entries
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true })
        } catch { return }

        const sorted = entries
            .filter((e) => !e.name.startsWith('.') || e.name === '.env.example')
            .filter((e) => {
                if (e.isDirectory()) return !IGNORE_DIRS.has(e.name)
                const ext = path.extname(e.name).toLowerCase()
                return !IGNORE_EXTENSIONS.has(ext)
            })
            .sort((a, b) => {
                if (a.isDirectory() && !b.isDirectory()) return -1
                if (!a.isDirectory() && b.isDirectory()) return 1
                return a.name.localeCompare(b.name)
            })

        for (const entry of sorted) {
            if (fileCount >= maxFiles) {
                lines.push(`${prefix}... (truncated at ${maxFiles} entries)`)
                break
            }
            fileCount++
            if (entry.isDirectory()) {
                lines.push(`${prefix}${entry.name}/`)
                walk(path.join(dir, entry.name), depth + 1, prefix + '  ')
            } else {
                lines.push(`${prefix}${entry.name}`)
            }
        }
    }

    walk(projectFolder, 0, '')
    return lines.join('\n')
}

/* ------------------------------------------------------------------ */
/*  Tech stack detection                                               */
/* ------------------------------------------------------------------ */

/**
 * Infer the tech stack from package.json and project structure.
 *
 * @param {string} projectFolder
 * @returns {{ runtime: string, framework: string, language: string, uiLibrary: string, testFramework: string, bundler: string, raw: object }}
 */
export function detectTechStack(projectFolder) {
    const result = {
        runtime: '',
        framework: '',
        language: '',
        uiLibrary: '',
        testFramework: '',
        bundler: '',
        raw: {},
    }
    if (!projectFolder) return result

    const pkgPath = path.join(projectFolder, 'package.json')
    let pkg = {}
    try {
        pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
        result.raw = { name: pkg.name, version: pkg.version }
    } catch { return result }

    const allDeps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
    }

    // Runtime
    if (allDeps.electron) result.runtime = 'Electron'
    else if (allDeps['react-native']) result.runtime = 'React Native'
    else result.runtime = 'Node.js'

    // Framework
    if (allDeps.next) result.framework = 'Next.js'
    else if (allDeps.nuxt) result.framework = 'Nuxt'
    else if (allDeps['@angular/core']) result.framework = 'Angular'
    else if (allDeps.svelte || allDeps['@sveltejs/kit']) result.framework = 'Svelte/SvelteKit'
    else if (allDeps.express) result.framework = 'Express'
    else if (allDeps.fastify) result.framework = 'Fastify'
    else if (allDeps.koa) result.framework = 'Koa'
    else if (allDeps.vite) result.framework = 'Vite'

    // Language
    if (allDeps.typescript || fs.existsSync(path.join(projectFolder, 'tsconfig.json'))) {
        result.language = 'TypeScript'
    } else {
        result.language = 'JavaScript'
    }

    // UI
    if (allDeps.react) result.uiLibrary = 'React'
    else if (allDeps.vue) result.uiLibrary = 'Vue'
    else if (allDeps.svelte) result.uiLibrary = 'Svelte'

    // Testing
    if (allDeps.jest) result.testFramework = 'Jest'
    else if (allDeps.vitest) result.testFramework = 'Vitest'
    else if (allDeps.mocha) result.testFramework = 'Mocha'
    else if (allDeps['@playwright/test']) result.testFramework = 'Playwright'
    else if (allDeps.cypress) result.testFramework = 'Cypress'

    // Bundler
    if (allDeps.webpack) result.bundler = 'Webpack'
    else if (allDeps.vite) result.bundler = 'Vite'
    else if (allDeps.esbuild) result.bundler = 'esbuild'
    else if (allDeps.rollup) result.bundler = 'Rollup'
    else if (allDeps.parcel) result.bundler = 'Parcel'

    return result
}

/* ------------------------------------------------------------------ */
/*  Relevant file finder                                               */
/* ------------------------------------------------------------------ */

/**
 * Find files whose names contain keywords from the task instruction.
 * Simple but effective heuristic for pointing agents at relevant code.
 *
 * @param {string} projectFolder
 * @param {string} taskInstruction
 * @param {{ maxResults?: number }} options
 * @returns {Array<string>} - Relative file paths
 */
export function findRelevantFiles(projectFolder, taskInstruction, { maxResults = 15 } = {}) {
    if (!projectFolder || !taskInstruction) return []

    // Extract keywords from the instruction (skip common stop words)
    const stopWords = new Set([
        'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'can', 'shall', 'to', 'of', 'in', 'for',
        'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
        'before', 'after', 'above', 'below', 'and', 'but', 'or', 'not', 'no',
        'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other',
        'some', 'such', 'than', 'too', 'very', 'just', 'about', 'also',
        'this', 'that', 'these', 'those', 'it', 'its', 'my', 'your',
        'review', 'check', 'analyze', 'find', 'look', 'fix', 'update',
        'code', 'file', 'module', 'function', 'class', 'component',
    ])

    const keywords = taskInstruction
        .toLowerCase()
        .replace(/[^a-z0-9\s_-]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length >= 3 && !stopWords.has(w))
        .slice(0, 12)

    if (!keywords.length) return []

    const matches = []

    function walk(dir, depth) {
        if (depth > 4 || matches.length >= maxResults * 3) return
        let entries
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true })
        } catch { return }

        for (const entry of entries) {
            if (entry.name.startsWith('.')) continue
            const fullPath = path.join(dir, entry.name)
            const relPath = path.relative(projectFolder, fullPath).replace(/\\/g, '/')

            if (entry.isDirectory()) {
                if (IGNORE_DIRS.has(entry.name)) continue
                walk(fullPath, depth + 1)
            } else {
                const ext = path.extname(entry.name).toLowerCase()
                if (IGNORE_EXTENSIONS.has(ext)) continue
                const nameLower = entry.name.toLowerCase().replace(/[^a-z0-9]/g, ' ')
                const pathLower = relPath.toLowerCase().replace(/[^a-z0-9]/g, ' ')
                let score = 0
                for (const kw of keywords) {
                    if (nameLower.includes(kw)) score += 3
                    else if (pathLower.includes(kw)) score += 1
                }
                if (score > 0) {
                    matches.push({ path: relPath, score })
                }
            }
        }
    }

    walk(projectFolder, 0)
    return matches
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults)
        .map((m) => m.path)
}

/* ------------------------------------------------------------------ */
/*  Full project context builder                                       */
/* ------------------------------------------------------------------ */

/**
 * Build a complete project context summary string.
 *
 * @param {string} projectFolder
 * @param {string} taskInstruction - The agent's task instruction
 * @returns {string} - Formatted context string ready for injection
 */
export function buildProjectContext(projectFolder, taskInstruction = '') {
    if (!projectFolder) return ''

    const parts = []

    // Tech stack
    const stack = detectTechStack(projectFolder)
    if (stack.runtime || stack.framework) {
        const stackItems = [
            stack.runtime, stack.framework, stack.language,
            stack.uiLibrary, stack.testFramework, stack.bundler,
        ].filter(Boolean)
        parts.push(`Tech stack: ${stackItems.join(', ')}`)
        if (stack.raw?.name) parts.push(`Project: ${stack.raw.name}${stack.raw.version ? ` v${stack.raw.version}` : ''}`)
    }

    // File tree (compact)
    const tree = buildFileTree(projectFolder, { maxDepth: 2, maxFiles: 80 })
    if (tree) {
        parts.push(`\nProject structure:\n${tree}`)
    }

    // Relevant files for the task
    if (taskInstruction) {
        const relevant = findRelevantFiles(projectFolder, taskInstruction)
        if (relevant.length > 0) {
            parts.push(`\nFiles likely relevant to this task:\n${relevant.map((f) => `  - ${f}`).join('\n')}`)
        }
    }

    return parts.join('\n')
}

