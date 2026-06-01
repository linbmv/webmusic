import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const karpovApiKey = process.env.KARPOV_API_KEY;

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    proxy: {
      "/api/music/free": {
        target: "https://ios.25pan.com/api/v1/freemusic",
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/music\/free/, ""),
      },
      "/api/music/karpov": {
        target: "https://gateway.karpov.cn",
        changeOrigin: true,
        secure: true,
        headers: karpovApiKey ? { Authorization: `Bearer ${karpovApiKey}` } : undefined,
        rewrite: (path) => path.replace(/^\/api\/music\/karpov/, ""),
      },
      "/api/music/gdstudio": {
        target: "https://music-api.gdstudio.xyz/api.php",
        changeOrigin: true,
        secure: true,
        rewrite: () => "",
      },
    },
  },
});
