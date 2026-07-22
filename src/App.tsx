import { HashRouter } from "react-router-dom";
import { AppStateProvider } from "./app/AppStateContext";
import { AppRoutes } from "./app/AppRoutes";

/**
 * The app's composition root — deliberately just wiring now. Every
 * page that used to be a boolean flag here (Settings, Paper Summary,
 * Synthesis, the Literature Matrix, Search, Export) is a real,
 * guarded route ("private route" in the same sense a logged-in-only
 * route is in apps that have accounts, except the gate is "is a
 * workspace — and, for two of them, a paper — open" instead of auth):
 * see `app/AppRoutes.tsx` for the route tree and guards, and
 * `app/AppStateContext.tsx` for the workspace/paper/reader state every
 * route shares (what this file used to hold directly, before the
 * "private routes" pass).
 *
 * `HashRouter`, not `BrowserRouter`, is deliberate: this app has no
 * server of its own to add SPA-fallback rewrite rules to, and a
 * hash-based URL (`#/settings`, `#/matrix`, ...) works identically
 * whether it's served by `vite dev`/`vite preview`, a plain static
 * file server, or opened straight from a built `dist/index.html` —
 * the fragment never reaches whatever's serving the file. Reload
 * persistence for *which page* now comes from the URL itself (the
 * browser reloads the same hash); which workspace/paper is active
 * still comes from `localStorage`, since neither is part of the URL.
 */
export default function App() {
  return (
    <HashRouter>
      <AppStateProvider>
        <AppRoutes />
      </AppStateProvider>
    </HashRouter>
  );
}
