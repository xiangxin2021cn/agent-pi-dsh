/**
 * Registry access: fetch the curated list from awesome-dsh-plugin.com with an
 * in-memory cache, falling back to the bundled snapshot when offline.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const REGISTRY_URL = 'https://awesome-dsh-plugin.com/plugins.json';
const TTL_MS = 60 * 60 * 1000;
let cache = null;
const AGENT_PI_UNIVER = {
    name: 'dsh-univer-office',
    owner: 'dream-num',
    url: 'https://github.com/dream-num/dsh-univer-office',
    npm: 'dsh-univer-office',
    category: 'tools',
    description: {
        zh: '官方 Office 插件 0.2.13 已预装，可在对话中创建、编辑和预览表格、文档及演示文稿。插件采用 Apache-2.0，完整保留上游组件及其附带许可证。',
        en: 'Official Office plugin 0.2.13 is preinstalled for creating, editing, and previewing sheets, docs, and slides in conversations. The Apache-2.0 plugin retains its complete upstream components and bundled licenses.',
    },
    install: 'dsh plugin --profile tender add dsh-univer-office',
    added: '2026-09-04',
};
export function applyAgentPiUniverPolicy(registry) {
    const plugins = registry.plugins.map((plugin) => {
        if (plugin.name !== AGENT_PI_UNIVER.name && plugin.npm !== AGENT_PI_UNIVER.npm)
            return plugin;
        return { ...plugin, description: AGENT_PI_UNIVER.description };
    });
    if (!plugins.some((plugin) => plugin.name === AGENT_PI_UNIVER.name || plugin.npm === AGENT_PI_UNIVER.npm)) {
        plugins.push(AGENT_PI_UNIVER);
    }
    return { ...registry, count: plugins.length, plugins };
}
function snapshot() {
    const path = fileURLToPath(new URL('../data/registry-snapshot.json', import.meta.url));
    return JSON.parse(readFileSync(path, 'utf8'));
}
export async function loadRegistry() {
    if (cache && Date.now() - cache.at < TTL_MS) {
        return { registry: applyAgentPiUniverPolicy(cache.data), source: 'cache' };
    }
    try {
        const res = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(4000) });
        if (!res.ok)
            throw new Error(`HTTP ${res.status}`);
        const data = (await res.json());
        if (!Array.isArray(data.plugins) || data.plugins.length === 0)
            throw new Error('empty registry');
        cache = { at: Date.now(), data };
        return { registry: applyAgentPiUniverPolicy(data), source: 'live' };
    }
    catch {
        return {
            registry: applyAgentPiUniverPolicy(cache?.data ?? snapshot()),
            source: cache ? 'cache' : 'snapshot',
        };
    }
}
