// boot-teardown.check.cjs — a caller that gets its parity server from
// _boot.cjs must not leave that server running, whether the caller exits
// normally or is SIGTERMed (the way `timeout` ends a gate). A leaked
// wo-docserver squats a gate port and the next gate reuses it (reuse-if-200
// in _boot.cjs). Drives the real _boot.cjs + docserver binary.
// Run: node tests/parity/boot-teardown.check.cjs
const assert = require('assert');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const BIN = process.env.WO_DOCSERVER_BIN || path.join(ROOT, 'target/debug/wo-docserver');
const DIST = path.join(ROOT, 'apps/web/apps/documenteditor-react/dist');
if (!fs.existsSync(BIN) || !fs.existsSync(path.join(DIST, 'index.html'))) {
  console.log('boot-teardown: SKIP (no docserver binary or editor dist built)');
  process.exit(0);
}
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'wo-parity-ui-'));
fs.symlinkSync(DIST, path.join(stage, 'word'));
const alive = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
const freePort = () => new Promise(res => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
// A caller with no teardown of its own, ending the way the surface scripts
// do (process.exit — the server's pipes would otherwise keep it alive):
// boot the server, print its pid, exit (or stay alive so the check can
// SIGTERM it).
const caller = keepAlive => `
  const { ensureServer } = require(${JSON.stringify(path.join(__dirname, '_boot.cjs'))});
  ensureServer().then(s => { console.log('PID ' + s.child.pid); ${keepAlive ? 'setInterval(() => {}, 1000);' : 'process.exit(0);'} });`;
const envFor = port => ({ ...process.env, WO_DOCSERVER_BIN: BIN, EDITOR_UI_DIR: stage, WO_PORT: String(port), NO_PROXY: '127.0.0.1,localhost' });
const serverPid = out => Number(/PID (\d+)/.exec(out)[1]);
const leaked = [];

(async () => {
  // 1. normal exit
  let port = await freePort();
  const r = spawnSync(process.execPath, ['-e', caller(false)], { env: envFor(port), encoding: 'utf8', timeout: 60000 });
  assert(/PID \d+/.test(r.stdout || ''), 'caller did not report its server pid: ' + (r.stderr || '').slice(-300));
  leaked.push(serverPid(r.stdout));
  assert(!alive(leaked[0]), `normal exit: caller is gone but its docserver (pid ${leaked[0]}, port ${port}) is still running`);

  // 2. SIGTERM while the caller is still using its server
  port = await freePort();
  const pid = await new Promise((res, rej) => {
    const c = spawn(process.execPath, ['-e', caller(true)], { env: envFor(port) });
    let out = '', started = false;
    const timer = setTimeout(() => rej(new Error('caller never reported its server pid: ' + out)), 30000);
    c.stdout.on('data', d => {
      out += d;
      if (/PID \d+/.test(out) && !started) { started = true; c.kill('SIGTERM'); }
    });
    c.on('exit', () => {
      clearTimeout(timer);
      if (!started) return rej(new Error('caller exited before reporting a server pid: ' + out));
      setTimeout(() => res(serverPid(out)), 300); // let the exit hook's SIGKILL land
    });
  });
  leaked.push(pid);
  assert(!alive(pid), `SIGTERM: caller was terminated but its docserver (pid ${pid}, port ${port}) is still running`);
})().catch(e => { console.error('boot-teardown: FAIL —', e.message); process.exitCode = 1; }).finally(() => {
  for (const p of leaked) if (alive(p)) { try { process.kill(p, 'SIGKILL'); } catch {} } // never leak from the leak check
  fs.rmSync(stage, { recursive: true, force: true });
  if (!process.exitCode) console.log('boot-teardown: ok');
});
