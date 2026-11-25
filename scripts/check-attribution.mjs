// Rejects attribution trailers, tool footers and unexpected identities in commits and PR text.
// Usage:
//   node scripts/check-attribution.mjs --message-file <file> --author "<ident>" --committer "<ident>"
//   node scripts/check-attribution.mjs --range   (reads ATTRIBUTION_BASE, ATTRIBUTION_HEAD, PR_TITLE, PR_BODY)
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// The repo forbids vendor and product names in tracked files, including this one, so every
// name is assembled from fragments. A unit test checks that none appears here as plain text.
/** @param {...string} parts */
const join = (...parts) => parts.join('');

export const VENDOR_WORDS = [
  join('anthr', 'opic'),
  join('cla', 'ude'),
  join('open', 'ai'),
  join('chat', 'gpt'),
  join('co', 'pilot'),
  join('gem', 'ini'),
  join('co', 'dex'),
  join('dev', 'in'),
  join('wind', 'surf'),
  join('code', 'ium'),
  join('tab', 'nine'),
];
// Versioned model names; the bare words are ordinary English, so a version number is required.
const MODEL_PATTERNS = [
  new RegExp(`\\b${join('g', 'pt')}[-\\s]?\\d`, 'i'),
  new RegExp(`\\b(${join('son', 'net')}|${join('op', 'us')}|${join('hai', 'ku')})[-\\s]?\\d`, 'i'),
];
export const SESSION_DOMAINS = [
  `${join('cla', 'ude')}.ai`,
  `${join('chat', 'gpt')}.com`,
  `chat.${join('open', 'ai')}.com`,
  `${join('ju', 'les')}.google`,
  `${join('cur', 'sor')}.com`,
  `${join('dev', 'in')}.ai`,
  `${join('wind', 'surf')}.com`,
  `${join('code', 'ium')}.com`,
];

export const OWNER_NAME = 'Suprabhat Kumar';
export const OWNER_EMAIL = 'suprabhatkumar02@gmail.com';
// The noreply form matches the GitHub web commits already in this repo's history.
export const OWNER_NOREPLY = '68507226+suprabhat02@users.noreply.github.com';
export const OWNER_EMAILS = [OWNER_EMAIL, OWNER_NOREPLY];

/**
 * @typedef {{ sha?: string, message: string, authorName?: string, authorEmail?: string,
 *   committerName?: string, committerEmail?: string }} Commit
 * @typedef {{ source: string, rule: string, detail: string, fix: string }} Violation
 */

const escape = (/** @type {string} */ text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const vendorWord = new RegExp(`\\b(${VENDOR_WORDS.map(escape).join('|')})\\b`, 'i');
const sessionLink = new RegExp(
  `https?://(?:[\\w-]+\\.)*(?:${SESSION_DOMAINS.map(escape).join('|')})\\b`,
  'i',
);

/** @param {string} text @param {string} source @returns {Violation[]} */
export function checkText(text, source) {
  /** @type {Violation[]} */
  const found = [];
  const add = (/** @type {string} */ rule, /** @type {string} */ detail, /** @type {string} */ fix) => {
    if (!found.some((v) => v.rule === rule)) found.push({ source, rule, detail, fix });
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^co-authored-by\s*:/i.test(line)) {
      add('co-author trailer', line, 'Delete the Co-authored-by line.');
    }
    // Hyphenated trailer keys (X-Session, Session-Id) or any key whose value is a session URL.
    if (
      /^(?=[\w-]*-)[\w-]*session[\w-]*\s*:/i.test(line) ||
      /^[\w-]*session[\w-]*\s*:\s*https?:\/\//i.test(line) ||
      /^[\w-]+\s*:\s*https?:\/\/\S*session/i.test(line)
    ) {
      add('session trailer', line, 'Delete the session trailer and its link.');
    }
    if (/\bgenerated[\s-]+(with|by)\b/i.test(line)) {
      add('generated-by line', line, 'Remove the "generated with/by" wording.');
    }
    for (const email of line.match(/[^\s<>"'()]+@[^\s<>"'()]+/g) ?? []) {
      if (/noreply/i.test(email) && vendorWord.test(email)) {
        add('vendor noreply address', email, 'Remove the trailer or footer that contains this address.');
      }
    }
    const link = sessionLink.exec(line);
    if (link) add('session link', link[0], 'Delete the link to the coding-session page.');
    const name = vendorWord.exec(line) ?? MODEL_PATTERNS.map((p) => p.exec(line)).find(Boolean);
    if (name) add('vendor or model name', name[0], 'Describe the change without naming a tool or vendor.');
  }
  return found;
}

/** @param {string | undefined} name @param {string | undefined} email @param {string} role @param {string} source */
export function checkIdentity(name, email, role, source) {
  if (name === OWNER_NAME && email !== undefined && OWNER_EMAILS.includes(email.toLowerCase())) return [];
  return [
    {
      source,
      rule: `unexpected ${role}`,
      detail: `${name ?? '(none)'} <${email ?? '(none)'}>`,
      fix: `Use ${OWNER_NAME} <${OWNER_EMAIL}>, e.g. git commit --amend --reset-author.`,
    },
  ];
}

/** @param {{ commits: Commit[], prTitle?: string, prBody?: string }} input @returns {Violation[]} */
export function checkAttribution({ commits, prTitle, prBody }) {
  const violations = commits.flatMap((commit, index) => {
    const sha = commit.sha ?? `commit ${index + 1}`;
    const source = /^[0-9a-f]{40}$/i.test(sha) ? sha.slice(0, 12) : sha;
    return [
      ...checkText(commit.message, source),
      ...checkIdentity(commit.authorName, commit.authorEmail, 'author', source),
      ...checkIdentity(commit.committerName, commit.committerEmail, 'committer', source),
    ];
  });
  if (prTitle) violations.push(...checkText(prTitle, 'PR title'));
  if (prBody) violations.push(...checkText(prBody, 'PR body'));
  return violations;
}

/** @param {Violation[]} violations */
export function formatViolations(violations) {
  return violations.map((v) => `${v.source}: ${v.rule} (${v.detail}). Fix: ${v.fix}`).join('\n');
}

/** Parses `git var GIT_AUTHOR_IDENT` output: `Name <email> 1700000000 +0530`. @param {string} ident */
export function parseIdent(ident) {
  const match = /^(.*?)\s*<([^>]*)>/.exec(ident.trim());
  return match ? { name: match[1], email: match[2] } : { name: ident.trim(), email: '' };
}

/** Removes the comment lines and scissors section git adds to the message file. @param {string} text */
export function stripComments(text) {
  const scissors = text.search(/^# -+ >8 -+$/m);
  return (scissors === -1 ? text : text.slice(0, scissors))
    .split(/\r?\n/)
    .filter((line) => !line.startsWith('#'))
    .join('\n')
    .trim();
}

/** @param {string} base @param {string} head @param {string} [cwd] @returns {Commit[]} */
export function readRange(base, head, cwd) {
  for (const sha of [base, head]) {
    if (!/^[0-9a-f]{40}$/i.test(sha)) throw new Error(`Expected a full commit SHA, got "${sha}".`);
  }
  const log = execFileSync(
    'git',
    ['log', '--format=%H%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%B%x1e', `${base}..${head}`],
    { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  return log
    .split('\x1e')
    .map((record) => record.replace(/^\s+/, ''))
    .filter(Boolean)
    .map((record) => {
      const [sha = '', authorName, authorEmail, committerName, committerEmail, message = ''] =
        record.split('\x1f');
      return { sha, authorName, authorEmail, committerName, committerEmail, message };
    });
}

/** @param {string[]} args @param {string} flag */
const option = (args, flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
};

function main(args = process.argv.slice(2), env = process.env) {
  /** @type {Violation[]} */
  let violations;
  if (args.includes('--range')) {
    const commits = readRange(env['ATTRIBUTION_BASE'] ?? '', env['ATTRIBUTION_HEAD'] ?? '');
    violations = checkAttribution({ commits, prTitle: env['PR_TITLE'], prBody: env['PR_BODY'] });
    console.log(`Checked ${commits.length} commit(s), the PR title and the PR body.`);
  } else {
    const file = option(args, '--message-file');
    if (!file) {
      console.error('Usage: --message-file <file> --author <ident> --committer <ident>, or --range.');
      return 2;
    }
    const author = parseIdent(option(args, '--author') ?? '');
    const committer = parseIdent(option(args, '--committer') ?? '');
    violations = checkAttribution({
      commits: [
        {
          sha: 'commit message',
          message: stripComments(readFileSync(file, 'utf8')),
          authorName: author.name,
          authorEmail: author.email,
          committerName: committer.name,
          committerEmail: committer.email,
        },
      ],
    });
  }
  if (violations.length === 0) return 0;
  console.error(`Attribution check failed:\n${formatViolations(violations)}`);
  return 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main();
}
