import fs from 'node:fs';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const ASSETS_ROOT = path.resolve(__dirname, '../../assets');
const ASSETS_FONTS_DIR = path.join(ASSETS_ROOT, 'fonts');
const ASSETS_BRAND_DIR = path.join(ASSETS_ROOT, 'brand');

const MIME_TYPES: Record<string, string> = {
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function resolveScopedAsset(baseDir: string, relPath: string): string | null {
  const cleanRel = relPath.split('?')[0]?.replace(/^\/+/, '') ?? '';
  if (!cleanRel || cleanRel.includes('\0')) return null;
  const candidate = path.resolve(baseDir, cleanRel);
  if (!candidate.startsWith(baseDir + path.sep)) return null;
  if (path.basename(candidate).startsWith('.')) return null;
  try {
    const stat = fs.statSync(candidate);
    return stat.isFile() ? candidate : null;
  } catch {
    return null;
  }
}

function serveScopedAssetMiddleware(
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void
): void {
  const url = req.url ?? '';
  let filePath: string | null = null;
  if (url.startsWith('/fonts/')) {
    filePath = resolveScopedAsset(ASSETS_FONTS_DIR, url.slice('/fonts/'.length));
  } else if (url.startsWith('/brand/')) {
    filePath = resolveScopedAsset(ASSETS_BRAND_DIR, url.slice('/brand/'.length));
  } else {
    next();
    return;
  }

  if (!filePath) {
    next();
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.setHeader('Content-Type', MIME_TYPES[ext] ?? 'application/octet-stream');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  fs.createReadStream(filePath).pipe(res);
}

/**
 * Serves and bundles ONLY `assets/fonts` and `assets/brand` at `/fonts/*` and `/brand/*`,
 * excluding non-web archival directories such as `assets/banners` and `assets/env`.
 */
function cuexScopedPublicAssets(): Plugin {
  return {
    name: 'cuex-scoped-public-assets',
    configureServer(server) {
      server.middlewares.use(serveScopedAssetMiddleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(serveScopedAssetMiddleware);
    },
    generateBundle() {
      const mount = (dir: string, prefix: string, allowedExts: Set<string>) => {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (!entry.isFile() || entry.name.startsWith('.')) continue;
          const ext = path.extname(entry.name).toLowerCase();
          if (!allowedExts.has(ext)) continue;
          this.emitFile({
            type: 'asset',
            fileName: `${prefix}/${entry.name}`,
            source: fs.readFileSync(path.join(dir, entry.name)),
          });
        }
      };

      mount(ASSETS_FONTS_DIR, 'fonts', new Set(['.ttf']));
      mount(ASSETS_BRAND_DIR, 'brand', new Set(['.svg', '.png', '.json']));
    },
  };
}

export default defineConfig({
  plugins: [react(), cuexScopedPublicAssets()],
  publicDir: false,
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    host: true,
    watch: { ignored: ['**/assets/banners/**', '**/assets/env/**'] },
    proxy: {
      '/api': { target: process.env.CUEX_SERVER_ORIGIN ?? 'http://127.0.0.1:8765' },
      '/ws': { target: process.env.CUEX_SERVER_ORIGIN ?? 'http://127.0.0.1:8765', ws: true },
      '/health': { target: process.env.CUEX_SERVER_ORIGIN ?? 'http://127.0.0.1:8765' },
    },
  },
  preview: {
    port: 5173,
    host: true,
  },
  build: {
    chunkSizeWarningLimit: 1000,
  },
});
