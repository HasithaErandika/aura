import { spawn, type ChildProcess } from 'node:child_process';
import type { Writable } from 'node:stream';

// A real pseudo-terminal without a native Node module: a tiny Python 3 bridge (the standard
// library's `pty`) forks the shell on a PTY and relays bytes over stdin/stdout. Window-size
// changes arrive on fd 3 as "rows cols\n" and are applied with TIOCSWINSZ, which makes the kernel
// signal SIGWINCH to the shell. node-pty was the obvious choice but needs a native build that
// fails without a compiler toolchain; python3 ships with every Linux distro and macOS.

const BRIDGE = `
import os, pty, select, sys, fcntl, termios, struct
pid, fd = pty.fork()
if pid == 0:
    os.execvp(sys.argv[1], sys.argv[1:])
def resize(rows, cols):
    fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', rows, cols, 0, 0))
watch = [0, 3, fd]
ctl = b''
while True:
    try:
        ready, _, _ = select.select(watch, [], [])
    except InterruptedError:
        continue
    if fd in ready:
        try:
            data = os.read(fd, 65536)
        except OSError:
            break
        if not data:
            break
        os.write(1, data)
    if 0 in ready:
        data = os.read(0, 65536)
        if data:
            os.write(fd, data)
        else:
            watch.remove(0)
            os.kill(pid, 1)
    if 3 in ready:
        data = os.read(3, 1024)
        if not data:
            watch.remove(3)
        else:
            ctl += data
            while b'\\n' in ctl:
                line, ctl = ctl.split(b'\\n', 1)
                try:
                    rows, cols = (int(v) for v in line.split())
                    resize(max(rows, 1), max(cols, 1))
                except Exception:
                    pass
_, status = os.waitpid(pid, 0)
sys.exit(os.waitstatus_to_exitcode(status))
`;

export interface PtySession {
  write(data: string): void;
  resize(rows: number, cols: number): void;
  kill(): void;
  onData(listener: (chunk: string) => void): void;
  onExit(listener: (code: number | null) => void): void;
}

export function spawnPty(shell: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, size: { rows: number; cols: number }): PtySession {
  const child: ChildProcess = spawn('python3', ['-c', BRIDGE, shell, ...args], { cwd, env, stdio: ['pipe', 'pipe', 'pipe', 'pipe'] });
  const control = child.stdio[3] as Writable;
  control.write(`${size.rows} ${size.cols}\n`);
  child.stdout!.setEncoding('utf8');
  child.stderr!.setEncoding('utf8');
  return {
    write: (data) => {
      if (!child.stdin!.destroyed) child.stdin!.write(data);
    },
    resize: (rows, cols) => {
      if (!control.destroyed) control.write(`${Math.round(rows)} ${Math.round(cols)}\n`);
    },
    kill: () => {
      if (child.exitCode === null) child.kill('SIGHUP');
    },
    onData: (listener) => {
      child.stdout!.on('data', listener);
      // The bridge's own failure (e.g. python3 missing a module) is worth showing, not hiding.
      child.stderr!.on('data', listener);
    },
    onExit: (listener) => {
      child.on('exit', (code) => listener(code));
      child.on('error', () => listener(null));
    },
  };
}
