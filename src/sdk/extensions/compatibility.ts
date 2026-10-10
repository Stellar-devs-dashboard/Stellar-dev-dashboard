import type { ExtensionManifest } from "./types";

export interface CompatibilityResult {
  compatible: boolean;
  hostVersion: string;
  requestedVersion: string;
  reason?: string;
}

function parseVersion(value: string): [number, number, number] | null {
  const match = /^(?:\^|~|>=)?(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function checkSdkCompatibility(
  manifest: Pick<ExtensionManifest, "sdkVersion">,
  hostVersion: string,
): CompatibilityResult {
  const requested = parseVersion(manifest.sdkVersion);
  const host = parseVersion(hostVersion);
  if (!requested || !host) {
    return {
      compatible: false,
      hostVersion,
      requestedVersion: manifest.sdkVersion,
      reason: "SDK versions must use semantic versioning",
    };
  }

  const compatible = requested[0] === host[0] && host[1] >= requested[1];
  return {
    compatible,
    hostVersion,
    requestedVersion: manifest.sdkVersion,
    reason: compatible
      ? undefined
      : `Extension requires SDK ${manifest.sdkVersion}, but host provides ${hostVersion}`,
  };
}

export function satisfiesDependency(installed: string, requested: string): boolean {
  const installedVersion = parseVersion(installed);
  const requestedVersion = parseVersion(requested);
  if (!installedVersion || !requestedVersion) return false;
  if (installedVersion[0] !== requestedVersion[0]) return false;

  if (requested.startsWith("^")) {
    return (
      installedVersion[1] > requestedVersion[1] ||
      (installedVersion[1] === requestedVersion[1] &&
        installedVersion[2] >= requestedVersion[2])
    );
  }
  if (requested.startsWith("~")) {
    return (
      installedVersion[1] === requestedVersion[1] &&
      installedVersion[2] >= requestedVersion[2]
    );
  }
  if (requested.startsWith(">=")) {
    return installedVersion.join(".").localeCompare(requestedVersion.join("."), undefined, {
      numeric: true,
    }) >= 0;
  }
  return installed === requested;
}
