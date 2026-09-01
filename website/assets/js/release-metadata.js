/* Validated identity metadata embedded in an Agent Pi GitHub Release body. */
(function (scope) {
  "use strict";

  function releaseIdentity(release) {
    var tag = release && release.tag_name;
    var body = release && typeof release.body === "string" ? release.body : "";
    var marker = /<!--\s*agent-pi-release-meta:\s*({[\s\S]*?})\s*-->/g;
    var matches = [];
    var match;
    while ((match = marker.exec(body)) !== null) matches.push(match[1]);
    if (matches.length > 1) return null;

    /* v3.5.2 predates the structured marker. Accept its visible release tag
       only when the body names exactly one distinct DSH version. */
    if (!matches.length) {
      if (tag !== "v3.5.2") return null;
      var versions = [];
      var versionPattern = /\bdsh-v\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?\b/gi;
      while ((match = versionPattern.exec(body)) !== null) {
        var version = match[0].toLowerCase();
        if (versions.indexOf(version) === -1) versions.push(version);
      }
      if (versions.length !== 1 || !/^v\d+\.\d+\.\d+$/.test(tag || "")) return null;
      return { appVersion: tag.slice(1), kernelVersion: versions[0], kernelPin: null };
    }

    var identity;
    try { identity = JSON.parse(matches[0]); } catch (error) { return null; }
    var appVersion = identity && identity.appVersion;
    var kernel = identity && identity.kernel;
    if (identity.schema !== 1 || !/^\d+\.\d+\.\d+$/.test(appVersion || "") || tag !== "v" + appVersion ||
      !kernel || !/^dsh-v\d+\.\d+\.\d+(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(kernel.releaseTag || "") ||
      !/^[a-f0-9]{40}$/i.test(kernel.commit || "")) return null;

    return {
      appVersion: appVersion,
      kernelVersion: kernel.releaseTag,
      kernelPin: kernel.commit.toLowerCase()
    };
  }

  scope.AgentPiReleaseMetadata = { releaseIdentity: releaseIdentity };
})(typeof window !== "undefined" ? window : globalThis);
