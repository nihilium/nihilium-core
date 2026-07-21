/**
 * System clipboard access
 *
 * Used so freshly generated private keys never have to be printed to the
 * terminal (where they end up in scrollback, tmux buffers and — worst of all —
 * shell session logs). The value is piped straight into the platform clipboard
 * helper's stdin; it is never passed as an argv element, which would expose it
 * in `ps` output.
 *
 * No npm dependency: every candidate is a binary that ships with the desktop
 * environment, with an OSC 52 terminal escape as the last resort for headless
 * / SSH sessions.
 */

import { spawn } from "node:child_process";
import { openSync, writeSync, closeSync } from "node:fs";

/** Human-readable description of the mechanism that carried the copy. */
export type ClipboardMethod = string;

interface Candidate {
  cmd:   string;
  args:  string[];
  label: string;
}

function candidates(): Candidate[] {
  switch (process.platform) {
    case "darwin":
      return [{ cmd: "pbcopy", args: [], label: "pbcopy" }];

    case "win32":
      return [{ cmd: "clip", args: [], label: "clip" }];

    default: {
      const wayland: Candidate[] = [{ cmd: "wl-copy", args: [], label: "wl-copy (Wayland)" }];
      const x11: Candidate[] = [
        { cmd: "xclip", args: ["-selection", "clipboard"], label: "xclip" },
        { cmd: "xsel",  args: ["--clipboard", "--input"],  label: "xsel"  },
      ];
      const extra: Candidate[] = [
        // WSL: the Windows clipboard is the one the user actually pastes from.
        { cmd: "clip.exe", args: [], label: "clip.exe (WSL)" },
        { cmd: "termux-clipboard-set", args: [], label: "termux-clipboard-set" },
      ];
      // Prefer the helper matching the running display server, but still try
      // the other one — an XWayland or headless-X setup can go either way.
      return process.env.WAYLAND_DISPLAY
        ? [...wayland, ...x11, ...extra]
        : [...x11, ...wayland, ...extra];
    }
  }
}

/** Pipe `text` into a clipboard helper's stdin. Resolves false if it is absent. */
function tryCommand(c: Candidate, text: string): Promise<boolean> {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(c.cmd, c.args, { stdio: ["pipe", "ignore", "ignore"] });
    } catch {
      resolve(false);
      return;
    }

    // ENOENT (helper not installed) surfaces here, not as a throw from spawn().
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
    child.stdin.on("error", () => resolve(false));
    child.stdin.end(text);
  });
}

/**
 * Copy via the OSC 52 escape sequence, which asks the *terminal emulator* to
 * set the clipboard. This is the only mechanism that works over a plain SSH
 * session, but it is silent: the terminal never reports back whether it obeyed,
 * and many terminals (and tmux without `set-clipboard on`) ignore it. Callers
 * must therefore present it as "probably copied".
 *
 * Written to /dev/tty rather than stdout so the escape is not captured when the
 * command's output is piped or redirected.
 */
function tryOsc52(text: string): boolean {
  const payload = Buffer.from(text, "utf8").toString("base64");
  const sequence = `]52;c;${payload}`;

  try {
    const fd = openSync("/dev/tty", "w");
    try {
      writeSync(fd, sequence);
    } finally {
      closeSync(fd);
    }
    return true;
  } catch {
    // No controlling terminal (/dev/tty missing on Windows, or output fully
    // detached) — fall back to stdout only when it really is a TTY.
    if (process.stdout.isTTY) {
      process.stdout.write(sequence);
      return true;
    }
    return false;
  }
}

export interface ClipboardResult {
  /** Which mechanism was used, for display. */
  method: ClipboardMethod;
  /** False for OSC 52, where success cannot be confirmed. */
  confirmed: boolean;
}

/**
 * Put `text` on the system clipboard.
 *
 * @throws when no mechanism is available, so callers can fall back to a file
 *         instead of ever printing the secret.
 */
export async function copyToClipboard(text: string): Promise<ClipboardResult> {
  for (const c of candidates()) {
    if (await tryCommand(c, text)) {
      return { method: c.label, confirmed: true };
    }
  }

  if (tryOsc52(text)) {
    return { method: "OSC 52 terminal escape", confirmed: false };
  }

  throw new Error(
    "No clipboard mechanism available. On Linux install one of: " +
      "wl-clipboard (wl-copy), xclip, or xsel.",
  );
}
