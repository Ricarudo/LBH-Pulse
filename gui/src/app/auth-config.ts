import { environment } from 'src/environments/environment';

export const apiConfig = {
  endpoint: environment.apiBaseUrl
};

export const roles = {
  Admin: 'Admin',
  Sales: 'Sales',
  ProjectManager: 'ProjectManager',
  Technician: 'Technician'
} as const;

export type LocalRole = typeof roles[keyof typeof roles];

// TODO: Reintroduce Microsoft Entra/Azure auth behind an AuthProvider interface.
// Keep route components depending on AuthService so Azure can be added back
// without spreading provider-specific imports throughout the Angular app again.
