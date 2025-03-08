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


// Rozhranie pre metadáta súboru
export interface FileMetadata {
  name: string;
  path: string;
  size: number;
  mimeType: string;
  createdAt: string;
  updatedAt: string;
  description?: string;
  tags?: string[];
  isPublic?: boolean;
  expiresAt?: string;
  userId?: string;
}

// Rozhranie pre postupný upload súboru
export interface ChunkUploadSession {
  id: string;
  userId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  filePath: string;
  tempDir: string;
  metadata?: FileMetadata;
  chunksReceived: number;
  totalChunks: number;
  createdAt: string;
}

// Rozhranie pre výsledok listu súborov
export interface FileListResult {
  items: FileMetadata[];
  totalItems: number;
  page: number;
  limit: number;
}
