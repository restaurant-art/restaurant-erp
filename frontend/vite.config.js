import { defineConfig, loadEnv } from "vite";

const apiRoutes = ["/api", "/admin", "/ws"];

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "");
  const target = environment.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000";

  return {
    server: {
      proxy: Object.fromEntries(apiRoutes.map((route) => [route, {
        target,
        changeOrigin: true,
        ws: route === "/ws",
      }])),
    },
  };
});
