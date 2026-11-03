/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** 后端地址，留空表示与前端同源（开发环境走 vite 代理） */
  readonly VITE_API_BASE?: string
  /** 站点标题覆盖 */
  readonly VITE_SITE_TITLE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
