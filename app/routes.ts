import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("login", "routes/login.tsx"),
  route("api/auth/login", "routes/api.auth.login.ts"),
  route("api/auth/logout", "routes/api.auth.logout.ts"),
  route("api/projects", "routes/api.projects.ts"),
  route("api/projects/upload", "routes/api.projects.upload.ts"),
  route("api/projects/:fileName", "routes/api.projects.$fileName.ts"),
  route("api/projects/:fileName/lock", "routes/api.projects.$fileName.lock.ts"),
  route("api/projects/:fileName/rename", "routes/api.projects.$fileName.rename.ts"),
  route("api/projects/:fileName/download", "routes/api.projects.$fileName.download.ts"),
  route("api/ai", "routes/api.ai.ts"),
] satisfies RouteConfig;
