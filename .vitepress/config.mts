// @ts-nocheck
import { defineConfig } from 'vitepress'
import fs from 'node:fs'
import path from 'node:path'

function readFileSafe(p: string): string | null {
  try {
    return fs.readFileSync(p, 'utf-8')
  } catch {
    return null
  }
}

function getTitleFromMarkdown(mdPath: string): string {
  const content = readFileSafe(mdPath) || ''
  // find first ATX H1 (# Title) or set from filename
  const m = content.match(/^#\s+(.+)$/m)
  if (m) return m[1].trim()
  const base = path.basename(mdPath, '.md')
  return base.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
}

type Toctree = {
  entries: string[]
  options: Record<string, string | boolean | number>
}

function parseToctree(mdPath: string): Toctree | null {
  const content = readFileSafe(mdPath)
  if (!content) return null
  // Match a myst toctree fenced block ```{toctree} ... ```
  const re = /```\{toctree\}([\s\S]*?)```/m
  const m = content.match(re)
  if (!m) return null
  const body = m[1].trim().split(/\r?\n/)
  const entries: string[] = []
  const options: Record<string, string | boolean | number> = {}
  for (const line of body) {
    const opt = line.match(/^:([a-zA-Z_]+):\s*(.*)$/)
    if (opt) {
      const key = opt[1]
      let val: string | boolean | number = opt[2] || ''
      if (val === '') val = true
      else if (/^\d+$/.test(val)) val = Number(val)
      options[key] = val
      continue
    }
    if (line.trim() === '') continue
    entries.push(line.trim())
  }
  return { entries, options }
}

function normalizeToMdPath(baseDir: string, rel: string): string {
  // Allow entries like "overview.md" or "concepts/index.md"
  // Resolve against baseDir and ensure .md extension
  const withExt = rel.endsWith('.md') ? rel : `${rel}.md`
  return path.resolve(baseDir, withExt)
}

type SidebarItem = { text: string; link?: string; items?: SidebarItem[]; collapsed?: boolean }

function buildSidebarFromToctree(rootDir: string, mdIndexPath: string, baseRoute = '/handbook/'): SidebarItem[] {
  const toc = parseToctree(mdIndexPath)
  if (!toc) return []
  const items: SidebarItem[] = []
  for (const entry of toc.entries) {
    const abs = normalizeToMdPath(rootDir, entry)
    if (!fs.existsSync(abs)) {
      console.warn(`[handbook sidebar] Skipping missing entry: ${entry}`)
      continue
    }
    const relFromRoot = path.relative(rootDir, abs).replace(/\\/g, '/')
    const route = relFromRoot
  .replace(/(^|\/)index\.md$/, (_m: string, p1: string) => (p1 ? p1 : ''))
      .replace(/\.md$/, '')
    const link = path.posix.join(baseRoute, route).replace(/\/+$/, '/')

    const title = getTitleFromMarkdown(abs)

    // If this is an index.md in a subfolder, try to get its own toctree as children
    const isSection = /(^|\/)index\.md$/.test(abs) && path.dirname(abs) !== path.resolve(rootDir)
    if (isSection) {
      const sectionDir = path.dirname(abs)
      const sectionIndex = abs
      const childItems = buildSidebarFromToctree(sectionDir, sectionIndex, path.posix.join(baseRoute, path.relative(rootDir, sectionDir).replace(/\\/g, '/')) + '/')
      items.push({ text: title, link, items: childItems, collapsed: false })
    } else {
      items.push({ text: title, link })
    }
  }
  return items
}

// https://vitepress.dev/reference/site-config
export default defineConfig({
  srcDir: "src",
  ignoreDeadLinks: true,
  // Don't render the Reveal markdown file as a standalone page
  srcExclude: [
    'public/slides.md'
  ],
  
  // Set base path dynamically based on environment variable
  // Usage: BASE_PATH=/my-repo/ npm run docs:build
  // Or in package.json: "docs:build:prod": "BASE_PATH=/ocdcpro-ttt-portal/ vitepress build"
  base: process.env.BASE_PATH || '/',
  
  title: "OCDCpro Teach-the-Teacher Portal",
  description: "A VitePress Site",
  themeConfig: {
    // Show deeper on-page outline (right sidebar) similar to Sphinx
    outline: 'deep',
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Overview Slides', link: '/overview-slides/' }
    ],

    // Use path-based sidebars so /handbook/ shows a dedicated, auto-generated sidebar
    sidebar: {
      '/handbook/': [
        {
          text: 'ICOS Design Handbook',
          items: (() => {
            const rootDir = path.resolve(process.cwd(), 'src/librelane-materials/ICOS-design-handbook/source')
            const indexPath = path.join(rootDir, 'index.md')
            return buildSidebarFromToctree(rootDir, indexPath, '/handbook/')
          })()
        }
      ],
      '/': [
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/vuejs/vitepress' }
    ]
  },

  // Map the handbook sources to live under /handbook/
  // Keys are paths relative to srcDir ("src/")
  rewrites: {
    'librelane-materials/ICOS-design-handbook/source/:rest*': 'handbook/:rest*',
  }
})
