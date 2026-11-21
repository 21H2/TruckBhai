import path from "node:path";

const backendDir = path.resolve(import.meta.dirname, "../..");

export const ENV_FILE = path.join(backendDir, ".env");
export const DATA_DIR = path.join(backendDir, "data");
export const FRONTEND_DIR = path.join(backendDir, "..", "frontend");
export const SERVER_HOST = "127.0.0.1";
export const DEFAULT_PORT = 3000;
export const DEFAULT_MONGODB_DATABASE = "truckbhai";
export const DEFAULT_PHOTON_URL = "https://photon.komoot.io/api/";
export const OSRM_DEMO_URL = "https://router.project-osrm.org/";
