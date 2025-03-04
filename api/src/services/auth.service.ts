import { SignJWT } from 'jose';
import { nanoid } from 'nanoid';
import { config } from '../config';
import { AppError } from '../middlewares/error-handler';

// Pre účely dema, v reálnom systéme by toto bolo v databáze
const DEMO_USERS = [
  {
    id: '1',
    username: 'admin',
    password: 'admin123', // V produkcii by toto bolo hašované!
    role: 'admin'
  },
  {
    id: '2',
    username: 'user',
    password: 'user123', // V produkcii by toto bolo hašované!
    role: 'user'
  }
];

// Uložené refresh tokeny (v reálnom systéme by boli v databáze)
const refreshTokens = new Map<string, { userId: string, expiresAt: number }>();

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Service pre autentifikáciu a autorizáciu
 */
export class AuthService {
  /**
   * Overí používateľské údaje a vytvorí JWT token
   */
  async login(username: string, password: string): Promise<TokenPair> {
    // Simulácia overenia používateľa
    const user = DEMO_USERS.find(
      u => u.username === username && u.password === password
    );

    if (!user) {
      throw new AppError('Neplatné prihlasovacie údaje', 401);
    }

    // Generuj tokeny
    return this.generateTokens(user.id, user.username, user.role);
  }

  /**
   * Obnoví JWT token pomocou refresh tokenu
   */
  async refreshToken(refreshToken: string): Promise<TokenPair> {
    // Skontroluj či refresh token existuje
    const tokenData = refreshTokens.get(refreshToken);
    if (!tokenData) {
      throw new AppError('Neplatný refresh token', 401);
    }

    // Skontroluj či token nevypršal
    if (tokenData.expiresAt < Date.now()) {
      refreshTokens.delete(refreshToken);
      throw new AppError('Refresh token vypršal', 401);
    }

    // Nájdi používateľa
    const user = DEMO_USERS.find(u => u.id === tokenData.userId);
    if (!user) {
      refreshTokens.delete(refreshToken);
      throw new AppError('Používateľ neexistuje', 401);
    }

    // Vygeneruj nové tokeny
    const newTokens = await this.generateTokens(user.id, user.username, user.role);

    // Vymaž starý refresh token
    refreshTokens.delete(refreshToken);

    return newTokens;
  }

  /**
   * Odhlási používateľa (zneplatní refresh token)
   */
  async logout(refreshToken: string): Promise<void> {
    refreshTokens.delete(refreshToken);
  }

  /**
   * Generuje pár JWT tokenov (access + refresh)
   */
  private async generateTokens(userId: string, username: string, role: string): Promise<TokenPair> {
    const encoder = new TextEncoder();
    const secretKey = encoder.encode(config.jwtSecret);

    // Čas expirácie access tokenu
    const expiresIn = 3600; // 1 hodina v sekundách

    // Vytvor access token
    const accessToken = await new SignJWT({
      sub: userId,
      username,
      role
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${expiresIn}s`)
      .sign(secretKey);

    // Vytvor refresh token
    const refreshToken = nanoid(40);

    // Ulož refresh token (v reálnom systéme by toto išlo do databázy)
    refreshTokens.set(refreshToken, {
      userId,
      // Refresh token vyprší za 30 dní
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
    });

    return {
      accessToken,
      refreshToken,
      expiresIn
    };
  }
}

// Export singleton inštancie
export const authService = new AuthService();
