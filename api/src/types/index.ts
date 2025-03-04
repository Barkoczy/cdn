// CDN API typové deklarácie
import { JWTPayload } from 'jose';

// Rozšírenie JWTPayload pre používateľa
export interface UserPayload extends JWTPayload {
  sub: string;
  username: string;
  role: string;
  iat: number;
  exp: number;
}

// Rozšírenie pre Hono vars/context
declare module 'hono' {
  interface ContextVariableMap {
    user: UserPayload;
  }
}
