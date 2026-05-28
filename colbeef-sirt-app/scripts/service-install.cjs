/* eslint-disable */
const fs = require('fs');
const path = require('path');
const { Service } = require('node-windows');

const projectRoot = path.resolve(__dirname, '..');
const scriptPath = path.join(projectRoot, 'server', 'index.js');

function readServerPort() {
  const envPath = path.join(projectRoot, '.env');
  if (!fs.existsSync(envPath)) return 3001;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*SERVER_PORT\s*=\s*(\d+)/);
    if (match) return Number(match[1]);
  }
  return 3001;
}

const serverPort = readServerPort();

const svc = new Service({
  name: 'Colbeef SIRT API',
  description: 'Servidor Node.js del Gestor de Visceras (Colbeef SIRT) escuchando en el puerto configurado en .env (SERVER_PORT).',
  script: scriptPath,
  workingDirectory: projectRoot,
  nodeOptions: [],
  env: [
    { name: 'NODE_ENV', value: 'production' },
  ],
  wait: 2,
  grow: 0.5,
  maxRestarts: 10,
});

svc.on('install', () => {
  console.log('[OK] Servicio instalado:', svc.name);
  svc.start();
});

svc.on('alreadyinstalled', () => {
  console.log('[INFO] El servicio ya estaba instalado:', svc.name);
});

svc.on('start', () => {
  console.log('[OK] Servicio iniciado:', svc.name);
  console.log('     Verifica con: http://localhost:' + serverPort + '/gestor.html');
});

svc.on('error', (err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});

svc.on('invalidinstallation', () => {
  console.error('[ERROR] Instalacion invalida del servicio.');
  process.exit(1);
});

console.log('[..] Instalando Colbeef SIRT API como Servicio de Windows...');
console.log('     Script:', scriptPath);
console.log('     Project:', projectRoot);

svc.install();
