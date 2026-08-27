import { copyFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const uuid = 'cinnamon-power-timer@irian-codes';
const sourceDirectory = resolve(root, 'applet', uuid);
const outputDirectory = resolve(root, 'dist', 'applet', uuid);
const outputFile = resolve(outputDirectory, 'applet.js');

await rm(outputDirectory, { force: true, recursive: true });
await mkdir(outputDirectory, { recursive: true });

await build({
  bundle: true,
  entryPoints: [resolve(sourceDirectory, 'src', 'applet.ts')],
  footer: {
    js: 'function main(metadata, orientation, panelHeight, instanceId) { return CinnamonPowerTimerBundle.main(metadata, orientation, panelHeight, instanceId); }',
  },
  format: 'iife',
  globalName: 'CinnamonPowerTimerBundle',
  legalComments: 'none',
  outfile: outputFile,
  platform: 'neutral',
  target: ['es2020'],
});

await Promise.all(
  ['metadata.json', 'settings-schema.json', 'stylesheet.css'].map((file) =>
    copyFile(resolve(sourceDirectory, file), resolve(outputDirectory, file)),
  ),
);

console.log(`Built ${outputDirectory}`);
