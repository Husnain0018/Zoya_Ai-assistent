import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      global: 'window.global',
      globalThis: 'window.global',
      process: 'window.process',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        'node-fetch': path.resolve(__dirname, 'node-fetch-mock.js'),
        'formdata-polyfill': path.resolve(__dirname, 'formdata-polyfill-mock.js'),
        'formdata-polyfill/esm.min.js': path.resolve(__dirname, 'formdata-polyfill-mock.js'),
        'formdata-polyfill/FormData.js': path.resolve(__dirname, 'formdata-polyfill-mock.js'),
        'formdata-polyfill/formdata.min.js': path.resolve(__dirname, 'formdata-polyfill-mock.js'),
        'ws': path.resolve(__dirname, 'ws-mock.js'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
