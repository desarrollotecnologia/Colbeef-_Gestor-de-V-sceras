/* eslint-disable */
const path = require('path');
const { Service } = require('node-windows');

const projectRoot = path.resolve(__dirname, '..');
const scriptPath = path.join(projectRoot, 'server', 'index.js');

const svc = new Service({
  name: 'Colbeef SIRT API',
  script: scriptPath,
});

svc.on('uninstall', () => {
  console.log('[OK] Servicio desinstalado:', svc.name);
  console.log('     Existe en SCM?', svc.exists);
});

svc.on('error', (err) => {
  console.error('[ERROR]', err);
  process.exit(1);
});

console.log('[..] Desinstalando Colbeef SIRT API...');
svc.uninstall();
