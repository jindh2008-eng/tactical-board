import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const ICON_DIR    = resolve(process.cwd(), 'public/event-icon');
const VIRTUAL_ID  = 'virtual:event-icons';
const RESOLVED_ID = '\0virtual:event-icons';

function readIconFiles(): string[] {
  try {
    return readdirSync(ICON_DIR)
      .filter(f => /\.png$/i.test(f))
      .sort();
  } catch {
    return [];
  }
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'event-icons',

      resolveId(id) {
        if (id === VIRTUAL_ID) return RESOLVED_ID;
      },

      load(id) {
        if (id !== RESOLVED_ID) return;
        return `export const EVENT_ICON_FILES = ${JSON.stringify(readIconFiles())};`;
      },

      configureServer(server) {
        server.watcher.add(ICON_DIR);

        function invalidate() {
          const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
          if (mod) server.moduleGraph.invalidateModule(mod);
          server.hot.send({ type: 'full-reload' });
        }

        function isPngInIconDir(f: string) {
          return /\.png$/i.test(f) && f.replace(/\\/g, '/').includes('/event-icon/');
        }

        server.watcher.on('add',    f => { if (isPngInIconDir(f)) invalidate(); });
        server.watcher.on('unlink', f => { if (isPngInIconDir(f)) invalidate(); });
      },
    },
  ],
});
