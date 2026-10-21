interface AwtrixNgSemanticVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

const SemanticVersionPattern = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

const toSemanticVersion = (value: string): AwtrixNgSemanticVersion | undefined => {
  const match = SemanticVersionPattern.exec(value);

  if (match === null) {
    return undefined;
  }

  const [major, minor, patch] = match.slice(1, 4).map(Number);

  if (![major, minor, patch].every(Number.isSafeInteger)) {
    return undefined;
  }

  return {
    major,
    minor,
    patch,
    ...(match[4] === undefined ? {} : { prerelease: match[4] }),
  };
};

const compareVersionCore = (left: AwtrixNgSemanticVersion, right: AwtrixNgSemanticVersion): number => {
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (left[key] !== right[key]) {
      return left[key] - right[key];
    }
  }

  return 0;
};

const isAwtrixNgFirmwareVersionSupported = (version: string, minimumVersion: string): boolean => {
  const current = toSemanticVersion(version);
  const minimum = toSemanticVersion(minimumVersion);

  if (current === undefined || minimum === undefined) {
    return false;
  }

  const coreComparison = compareVersionCore(current, minimum);

  if (coreComparison !== 0) {
    return coreComparison > 0;
  }

  // A prerelease of the minimum version is older than the final minimum release.
  return current.prerelease === undefined;
};

export default isAwtrixNgFirmwareVersionSupported;
