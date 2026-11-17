import { Capacitor } from "@capacitor/core";

const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

function resolveUrl(path) {
  if (Capacitor.isNativePlatform() && !apiBaseUrl) {
    throw new Error("The iPhone build needs VITE_API_BASE_URL set to the verified Cloudflare Worker URL.");
  }
  return apiBaseUrl ? `${apiBaseUrl}${path}` : path;
}

async function request(path, options = {}) {
  const response = await fetch(resolveUrl(path), {
    ...options,
    credentials: options.credentials || (apiBaseUrl ? "include" : "same-origin"),
    headers: {
      ...(options.body && !(options.body instanceof Blob) ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : await response.text();

  if (!response.ok) {
    const message = typeof payload === "object" ? payload.error : payload;
    throw new Error(message || `Request failed (${response.status})`);
  }
  return payload;
}

export const api = {
  me: () => request("/api/me"),
  setup: data => request("/api/setup", { method: "POST", body: JSON.stringify(data) }),
  login: data => request("/api/login", { method: "POST", body: JSON.stringify(data) }),
  logout: () => request("/api/logout", { method: "POST" }),
  createUser: data => request("/api/users", { method: "POST", body: JSON.stringify(data) }),
  listJobs: () => request("/api/jobs"),
  createJob: data => request("/api/jobs", { method: "POST", body: JSON.stringify(data) }),
  updateJob: (id, data) => request(`/api/jobs/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) }),
  shareJob: (id, data) => request(`/api/jobs/${encodeURIComponent(id)}/members`, { method: "POST", body: JSON.stringify(data) }),
  listMeasurements: jobId => request(`/api/jobs/${encodeURIComponent(jobId)}/measurements`),
  createMeasurement: (jobId, data) => request(`/api/jobs/${encodeURIComponent(jobId)}/measurements`, { method: "POST", body: JSON.stringify(data) }),
  updateMeasurement: (id, data) => request(`/api/measurements/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteMeasurement: id => request(`/api/measurements/${encodeURIComponent(id)}`, { method: "DELETE" })
};