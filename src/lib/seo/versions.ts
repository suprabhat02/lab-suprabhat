import lockSource from '../../../package-lock.json?raw';

/** Reads installed versions from a package-lock (v2/v3) so published numbers can't go stale. */
export function versionsFrom(source: string, names: readonly string[]): Record<string, string> {
  const lock = JSON.parse(source) as { packages?: Record<string, { version?: unknown }> };
  return Object.fromEntries(
    names.map((name) => {
      const version = lock.packages?.[`node_modules/${name}`]?.version;
      if (typeof version !== 'string') throw new Error(`${name} is not in package-lock.json.`);
      return [name, version];
    }),
  );
}

export const lockedVersions = (names: readonly string[]) => versionsFrom(lockSource, names);
