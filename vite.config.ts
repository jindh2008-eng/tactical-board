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
  // 같은 와이파이의 태블릿·실기기에서 접속할 수 있게 0.0.0.0 으로 바인딩한다.
  // 반응형(--ui-scale)과 터치 드래그는 개발용 브라우저 패널에서 검증이 안 되므로
  // (패널이 프레임을 합성하지 않아 ResizeObserver 가 안 돈다) 실기기 확인이 필요하다.
  server: {
    host: true,
  },

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
