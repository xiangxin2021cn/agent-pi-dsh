// Inserts the 3.1.0 release banner at the top of the agent-pi README via the
// contents API (gh CLI would transcode the UTF-8 Chinese text on this host).
import { execSync } from 'node:child_process'

const token = execSync('gh auth token', { encoding: 'utf8' }).trim()
const repo = 'xiangxin2021cn/agent-pi'
const headers = {
  authorization: `Bearer ${token}`,
  'user-agent': 'agent-pi-release',
  accept: 'application/vnd.github+json',
}

const meta = await (await fetch(`https://api.github.com/repos/${repo}/contents/README.md`, { headers })).json()
const current = Buffer.from(meta.content, 'base64').toString('utf8')

if (current.includes('v3.1.0 已发布')) {
  console.log('banner already present, skipping')
  process.exit(0)
}

const banner = `> [!IMPORTANT]
> ## v3.1.0 已发布 — 内核已更换为 DeepSeek Harness / New engine: DeepSeek Harness
>
> 从 3.0 起，Agent π 的执行内核由 Craft Agents OSS 整体迁移到 **DeepSeek Harness**（"一切皆插件"的智能体框架），3.1.0 在新内核上完成专业工作台的体系化强化：一句话蒸馏领域模块、本地知识库、统一成果树、阶段流程监控、J-Space 认知套件。
> Since 3.0 the runtime has been transplanted from Craft Agents OSS to **DeepSeek Harness** (an everything-is-a-plugin agent framework). 3.1.0 adds module distillation, a local knowledge base, a unified deliverable tree, stage-level process monitoring, and the J-Space cognition suite on top of the new engine.
>
> **[⬇ 下载 / Download](https://github.com/xiangxin2021cn/agent-pi/releases/latest)** ｜ [3.1.0 更新说明 / Release notes](https://github.com/xiangxin2021cn/agent-pi/releases/tag/v3.1.0)
>
> 注：本仓库 main 分支源码为 2.x 世代（Craft Agents OSS 架构）；3.x 桌面端以 Release 安装包发布。
> Note: the source on \`main\` is the 2.x generation (Craft Agents OSS); the 3.x desktop app ships as release installers.

`

// Insert after the logo <p align="center">...</p> block so the banner sits
// under the title but above the 2.x introduction.
const anchor = '</p>\n'
const idx = current.indexOf(anchor)
const updated = idx === -1
  ? banner + current
  : current.slice(0, idx + anchor.length) + '\n' + banner + current.slice(idx + anchor.length)

const res = await fetch(`https://api.github.com/repos/${repo}/contents/README.md`, {
  method: 'PUT',
  headers: { ...headers, 'content-type': 'application/json' },
  body: JSON.stringify({
    message: 'docs: add 3.1.0 release banner (DeepSeek Harness engine)',
    content: Buffer.from(updated, 'utf8').toString('base64'),
    sha: meta.sha,
  }),
})
if (!res.ok) throw new Error(`PUT README: ${res.status} ${await res.text()}`)
console.log('README banner committed')
