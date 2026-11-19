#!/usr/bin/env bun
// The playground: generate the app from the design repo and wip/, then show it live on the web and macOS side by
// side (iOS on demand). Every save in the design repo, theme.json, the presets or wip/ regenerates it, and both
// hosts reload.
//
//   bun play.mjs            web and macOS, live, until ctrl-c
//   bun play.mjs web        the web only
//   bun play.mjs ios        iOS once (a simulator, no window), beside a running `bun play.mjs`
//   bun play.mjs gen        write the app once
//   bun play.mjs check      the app is what the design makes, and the guard passes
//   bun play.mjs save <n>   keep theme.json's current values as presets/<n>.json in the design repo
//   bun play.mjs stop       end what this playground started
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, watch, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const HERE = import.meta.dir;
const DESIGN = resolve(HERE, '__DESIGN__');
const TOOLS = join(DESIGN, 'tools');
const PIDS = join(HERE, '.exact', 'play.pids');
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { stdio: 'inherit', cwd: HERE, ...opts });

// Live packages: each design package is a link to the design repo, so a save there is a save here.
function link() {
  const pkg = JSON.parse(readFileSync(join(HERE, 'package.json'), 'utf8'));
  for (const [name, spec] of Object.entries(pkg.dependencies ?? {})) {
    if (!String(spec).startsWith('file:')) continue;
    const target = resolve(HERE, String(spec).slice(5));
    const at = join(HERE, 'node_modules', name);
    mkdirSync(join(at, '..'), { recursive: true });
    if (existsSync(at) && lstatSync(at).isSymbolicLink()) continue;
    rmSync(at, { recursive: true, force: true });
    symlinkSync(target, at);
  }
}

// The theme's bundled faces, copied where Exact reads them (the app's own assets/; a link out of the app is refused).
function fonts() {
  const from = join(DESIGN, 'theme', 'assets', 'fonts');
  if (!existsSync(from)) return;
  const to = join(HERE, 'assets', 'fonts');
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from)) {
    const a = readFileSync(join(from, f));
    if (!existsSync(join(to, f)) || !a.equals(readFileSync(join(to, f)))) writeFileSync(join(to, f), a);
  }
}

function gen() {
  if (run('bun', [join(TOOLS, 'theme.mjs'), 'build', join(DESIGN, 'theme.json'), join(DESIGN, 'theme')]).status !== 0) return false;
  fonts();
  return run('bun', [join(TOOLS, 'matrix.mjs'), 'gen', DESIGN, HERE]).status === 0;
}

function check() {
  const dir = mkdtempSync(join(tmpdir(), 'playground-check-'));
  for (const f of ['package.json', 'samples.json']) if (existsSync(join(HERE, f))) copyFileSync(join(HERE, f), join(dir, f));
  run('cp', ['-R', join(HERE, 'wip'), join(dir, 'wip')]);
  const made = run('bun', [join(TOOLS, 'matrix.mjs'), 'gen', DESIGN, dir], { stdio: 'pipe' }).status === 0;
  const stale = made ? ['app.contract', 'app.ts', 'app.forma', 'app.test.contract'].filter((f) => readFileSync(join(dir, f), 'utf8') !== readFileSync(join(HERE, f), 'utf8')) : ['(the design does not generate)'];
  rmSync(dir, { recursive: true, force: true });
  if (stale.length) {
    console.error(`REFUSED by the playground check (AGENTS.md: the app is generated): ${stale.join(', ')} differ from what the design makes. Run: bun play.mjs gen`);
    return 1;
  }
  return run('bun', [join(TOOLS, 'ui-guard.mjs'), HERE]).status ?? 1;
}

function remember(child) {
  mkdirSync(join(HERE, '.exact'), { recursive: true });
  writeFileSync(PIDS, `${existsSync(PIDS) ? readFileSync(PIDS, 'utf8') : ''}${child.pid}\n`);
}

function stop() {
  if (!existsSync(PIDS)) return 0;
  for (const pid of readFileSync(PIDS, 'utf8').split('\n').filter(Boolean)) {
    try { process.kill(-Number(pid), 'SIGTERM'); } catch { try { process.kill(Number(pid), 'SIGTERM'); } catch {} }
  }
  rmSync(PIDS, { force: true });
  console.log('playground: stopped');
  return 0;
}

async function live(hosts) {
  link();
  if (!gen()) return 1;
  // Exact's dev loop listens on 127.0.0.1 only (its --lan binds every interface; not used here).
  const port = process.env.PLAY_PORT ?? '7750';
  const web = spawn('bun', ['exact.mjs', 'web', '--port', port], { cwd: HERE, stdio: ['ignore', 'pipe', 'inherit'], detached: true });
  remember(web);
  const url = await new Promise((done) => {
    web.stdout.on('data', (b) => {
      const s = String(b);
      process.stdout.write(s);
      const m = /(https?:\/\/[^\s]+)/.exec(s);
      if (m) done(m[1].replace(/\/$/, ''));
    });
    web.on('exit', () => done(''));
  });
  if (!url) return 1;
  console.log(`playground: web at ${url}`);
  if (hosts.includes('macos')) {
    const mac = spawn('bun', ['exact.mjs', 'mac', '--run', '--url', url], { cwd: HERE, stdio: 'inherit', detached: true });
    remember(mac);
  }
  let timer = null;
  const again = () => { clearTimeout(timer); timer = setTimeout(() => gen(), 200); };
  for (const dir of [DESIGN, join(HERE, 'wip')]) {
    watch(dir, { recursive: true }, (_, file) => {
      if (!file || /node_modules|\.exact|target|theme\.(forma|css)|tailwind\.css/.test(file)) return;
      if (/\.(contract|json|forma)$/.test(file)) again();
    });
  }
  console.log('playground: watching the design repo and wip/; ctrl-c ends it');
  await new Promise((done) => process.on('SIGINT', done));
  return stop();
}

function save(name) {
  if (!/^[a-z][a-z0-9-]*$/.test(name ?? '')) { console.error('usage: bun play.mjs save <name> (lower case, digits, hyphens)'); return 2; }
  mkdirSync(join(DESIGN, 'presets'), { recursive: true });
  const theme = JSON.parse(readFileSync(join(DESIGN, 'theme.json'), 'utf8'));
  writeFileSync(join(DESIGN, 'presets', `${name}.json`), `${JSON.stringify({ ...theme, name }, null, 2)}\n`);
  console.log(`playground: saved theme.json as presets/${name}.json`);
  return 0;
}

const [verb, arg] = process.argv.slice(2);
const code = verb === 'gen' ? (link(), gen() ? 0 : 1)
  : verb === 'check' ? check()
  : verb === 'stop' ? stop()
  : verb === 'save' ? save(arg)
  : verb === 'ios' ? (run('bun', ['exact.mjs', 'ios', '--run'], { env: { ...process.env, EXACT_SHOW_SIMULATOR: '0' } }).status ?? 1)
  : verb === 'web' ? await live(['web'])
  : !verb ? await live(['web', 'macos'])
  : (console.error('usage: bun play.mjs [web|ios|gen|check|save <name>|stop]'), 2);
process.exit(code);
