import { join } from 'node:path'

/** Edition metadata is shipped with the app, never selected by a runtime environment variable. */
export function desktopProductIdentity(manifest) {
  const edition = manifest.agentPiProduct?.edition || 'mainline'
  if (!['mainline', 'tender'].includes(edition)) throw new Error('Unsupported product edition')
  const tender = edition === 'tender'
  return {
    edition,
    name: manifest.build?.productName || (tender ? 'Agent Pi DSH 投标专版' : 'Agent Pi DSH'),
    executableName: manifest.build?.win?.executableName || (tender ? 'agent-pi-DSH-tender' : 'agent-pi-DSH'),
    appId: manifest.build?.appId || (tender ? 'do.agentpi.dsh.tender' : 'do.agentpi.dsh'),
    userDataName: tender ? 'agent-pi-dsh-tender-desktop' : 'agent-pi-dsh-desktop',
    artifactStem: tender ? 'Agent-Pi-DSH-Tender' : 'Agent-Pi-DSH',
    releaseTagPrefix: tender ? 'tender-v' : 'v',
  }
}

export function editionUserDataPath(product, appData, explicitUserData) {
  return explicitUserData || join(appData, product.userDataName)
}

export function matchingProductRelease(product, releases) {
  return releases.filter(release => !release.draft && !release.prerelease && new RegExp('^' + product.releaseTagPrefix + '\\d+\\.\\d+\\.\\d+$').test(release.tag_name || ''))
    .sort((a, b) => {
      const left = a.tag_name.slice(product.releaseTagPrefix.length).split('.').map(Number)
      const right = b.tag_name.slice(product.releaseTagPrefix.length).split('.').map(Number)
      for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return right[i] - left[i]
      return 0
    })[0]
}
