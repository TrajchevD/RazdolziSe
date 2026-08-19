import { environment } from '../../environments/environment';

// Single place to change if the backend ever runs on a different port/host.
// Value comes from src/environments — environment.ts for `ng serve`,
// environment.prod.ts for production builds (see fileReplacements in angular.json).
export const API_BASE_URL = environment.apiBaseUrl;
