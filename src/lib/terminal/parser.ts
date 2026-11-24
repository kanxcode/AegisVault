export interface ParsedCommand {
  raw: string;
  command: string;
  args: string[];
  positional: string[];
  flags: Set<string>;
  options: Record<string, string>;
}

export type ParseResult =
  | { ok: true; parsed: ParsedCommand }
  | { ok: false; kind: "EMPTY" | "SYNTAX" | "SECURITY"; error: string };

const BLOCKED_SHELL_COMMANDS = new Set([
  "sh",
  "bash",
  "zsh",
  "dash",
  "fish",
  "ksh",
  "csh",
  "cmd",
  "powershell",
  "pwsh",
  "sudo",
  "su",
  "eval",
  "exec",
  "rm",
  "rmdir",
  "mv",
  "cp",
  "chmod",
  "chown",
  "chgrp",
  "kill",
  "pkill",
  "killall",
  "shutdown",
  "reboot",
  "halt",
  "poweroff",
  "dd",
  "mkfs",
  "fdisk",
  "mount",
  "umount",
  "curl",
  "wget",
  "nc",
  "ncat",
  "socat",
  "ssh",
  "scp",
  "sftp",
  "python",
  "python3",
  "node",
  "perl",
  "ruby",
  "php",
  "sql",
  "drop",
  "truncate",
  "alter",
  "delete",
]);

const UNQUOTED_INJECTION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /&&|\|\|/, label: "logical shell chaining (&& / ||)" },
  { pattern: /;/, label: "command separator (;)" },
  { pattern: /\|/, label: "pipe operator (|)" },
  { pattern: /`/, label: "backtick command substitution (`)" },
  { pattern: /\$\(/, label: "subshell substitution ($())" },
  { pattern: /\$\{/, label: "variable expansion (${})" },
  { pattern: />>|<<|>|</, label: "shell redirection (>/<)" },
  { pattern: /&$/, label: "background execution (&)" },
];

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;

export function isValidDbIdentifier(ident: string): boolean {
  return IDENTIFIER_PATTERN.test(ident);
}

/**
 * Tokenize raw terminal input while distinguishing quoted strings from unquoted
 * shell metacharacters. Rejects injection operators and unterminated quotes.
 */
export function parseCommandInput(rawInput: string): ParseResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return { ok: false, kind: "EMPTY", error: "" };
  }

  const tokens: string[] = [];
  let current = "";
  let inToken = false;
  let quote: '"' | "'" | null = null;
  let unquotedChunk = "";

  const checkUnquotedChunk = (chunk: string): string | null => {
    if (!chunk) return null;
    for (const rule of UNQUOTED_INJECTION_PATTERNS) {
      if (rule.pattern.test(chunk)) {
        return `[SECURITY] Blocked shell injection construct: ${rule.label} is not permitted in the sandboxed interpreter.`;
      }
    }
    return null;
  };

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];

    if (quote) {
      if (ch === "\\" && quote === '"' && i + 1 < trimmed.length) {
        current += trimmed[i + 1];
        i++;
        continue;
      }
      if (ch === quote) {
        quote = null;
        continue;
      }
      current += ch;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const secErr = checkUnquotedChunk(unquotedChunk);
      if (secErr) return { ok: false, kind: "SECURITY", error: secErr };
      unquotedChunk = "";
      quote = ch;
      inToken = true;
      continue;
    }

    if (/\s/.test(ch)) {
      const secErr = checkUnquotedChunk(unquotedChunk);
      if (secErr) return { ok: false, kind: "SECURITY", error: secErr };
      unquotedChunk = "";
      if (inToken) {
        tokens.push(current);
        current = "";
        inToken = false;
      }
      continue;
    }

    if (ch === "\\" && i + 1 < trimmed.length) {
      const next = trimmed[i + 1];
      current += next;
      inToken = true;
      i++;
      continue;
    }

    unquotedChunk += ch;
    current += ch;
    inToken = true;
  }

  if (quote) {
    return {
      ok: false,
      kind: "SYNTAX",
      error: `[SYNTAX ERROR] Unterminated ${quote === '"' ? "double" : "single"} quote in command input.`,
    };
  }

  const tailErr = checkUnquotedChunk(unquotedChunk);
  if (tailErr) return { ok: false, kind: "SECURITY", error: tailErr };

  if (inToken) {
    tokens.push(current);
  }

  if (tokens.length === 0) {
    return { ok: false, kind: "EMPTY", error: "" };
  }

  const command = tokens[0].toLowerCase();
  if (BLOCKED_SHELL_COMMANDS.has(command)) {
    return {
      ok: false,
      kind: "SECURITY",
      error: `[SECURITY] Permission denied: '${command}' is disabled in the AegisVault sandboxed console. Host execution and unrestricted destructive operations are prohibited.`,
    };
  }

  const args = tokens.slice(1);
  const flags = new Set<string>();
  const options: Record<string, string> = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--") && arg.length > 2) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        const k = arg.slice(2, eqIdx).toLowerCase();
        const v = arg.slice(eqIdx + 1);
        options[k] = v;
      } else {
        const k = arg.slice(2).toLowerCase();
        const next = args[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          options[k] = next;
          i++;
        } else {
          flags.add(k);
        }
      }
    } else if (arg.startsWith("-") && arg.length > 1) {
      // Split bundled single-char flags like -la into 'l' and 'a', and preserve 'la'
      const rawFlags = arg.slice(1);
      flags.add(rawFlags);
      for (const ch of rawFlags) {
        flags.add(ch);
      }
    } else {
      positional.push(arg);
    }
  }

  return {
    ok: true,
    parsed: {
      raw: trimmed,
      command,
      args,
      positional,
      flags,
      options,
    },
  };
}

