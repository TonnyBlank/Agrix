const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const files = {
  backend: path.join(root, 'backend/.env'),
  frontend: path.join(root, 'frontend/.env'),
};

function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    env[key] = value;
  }
  return env;
}

function serializeEnv(env) {
  return `${Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')}\n`;
}

function mergeEnv(filePath, updates) {
  const current = parseEnv(filePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, serializeEnv({ ...current, ...updates }));
}

const backend = parseEnv(files.backend);
const frontend = parseEnv(files.frontend);

const supabaseUrl =
  frontend.VITE_SUPABASE_URL ||
  frontend.VITE_SUPABASE_PROJECT_URL ||
  backend.SUPABASE_URL;

const supabaseAnonKey =
  frontend.VITE_SUPABASE_ANON_KEY ||
  frontend.VITE_SUPABASE_PUBLISHABLE_KEY ||
  backend.SUPABASE_ANON_KEY ||
  backend.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase URL or anon key in backend/.env or frontend/.env.');
  process.exit(1);
}

mergeEnv(files.backend, {
  SUPABASE_URL: supabaseUrl,
  SUPABASE_ANON_KEY: supabaseAnonKey,
});

mergeEnv(files.frontend, {
  VITE_SUPABASE_URL: supabaseUrl,
  VITE_SUPABASE_ANON_KEY: supabaseAnonKey,
});

console.log('Synced Supabase credentials into the web and backend env files.');
