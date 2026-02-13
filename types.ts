
export enum GameState {
  MENU = 'MENU',
  LOADING_MAP = 'LOADING_MAP',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
}

export enum GameMode {
  DEATHMATCH = 'DEATHMATCH', // FFA or Team, infinite respawn
  ELIMINATION = 'ELIMINATION', // One life per round
}

export enum Team {
  BLUE = 'BLUE',
  RED = 'RED',
  NONE = 'NONE' // For FFA
}

export enum WeaponType {
  MAGIC_WAND = 'MAGIC_WAND',
  AWP = 'AWP',
}

export enum GrenadeType {
  HE = 'HE',
  FLASH = 'FLASH',
  MOLOTOV = 'MOLOTOV',
}

export interface Vector2 {
  x: number;
  y: number;
}

export interface Entity {
  id: string;
  pos: Vector2;
  vel: Vector2;
  radius: number;
  color: string;
  isDead: boolean;
}

export interface WeaponState {
  currentAmmo: number;
  isReloading: boolean;
  reloadTimer: number;
}

export interface GameConfig {
  botsEnabled: boolean;
  gameMode: GameMode;
  allyCount: number; // 0-4
  enemyCount: number; // 1-4
  isTeamDeathmatch: boolean; // True = Team, False = FFA
  roundsToWin: number;
}

export interface DamageRecord {
  attackerId: string;
  damage: number;
  timestamp: number;
}

export interface Player extends Entity {
  hp: number;
  maxHp: number;
  team: Team; 
  weapon: WeaponType;
  selectedGrenade: GrenadeType;
  rotation: number; // in radians
  isBot: boolean;
  name: string;
  score: number;
  grenades: { [key in GrenadeType]: number };
  grenadeCooldowns: { [key in GrenadeType]: number }; // Time until regen
  weaponStates: { [key in WeaponType]: WeaponState };
  lastShotTime: number;
  lastGrenadeTime: number;
  flashIntensity: number; // 0 to 1, for blind effect
  respawnTimer: number; // For Deathmatch
  
  // Damage History for Assists
  damageHistory: DamageRecord[];

  // AI State
  aiTargetId?: string | null;
  aiState?: 'IDLE' | 'CHASING' | 'FLEEING' | 'SEARCHING' | 'INVESTIGATING';
  aiPatrolPoint?: Vector2 | null;
  aiLastKnownPos?: Vector2 | null; // Memory of where the player was
  aiStrafeDir?: number; // -1 (left), 0 (none), 1 (right)
  aiStrafeTimer?: number; // How long to hold this strafe or wait state
}

export interface Projectile extends Entity {
  damage: number;
  ownerId: string;
  type: WeaponType;
  lifeTime: number; // frames or ms
}

export interface Particle {
  pos: Vector2;
  vel: Vector2;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
}

export interface GrenadeProjectile extends Entity {
  type: GrenadeType;
  ownerId: string;
  lifeTime: number; // fuse
  targetPos?: Vector2; // For Molotov/Targeted throws
}

export interface Explosion {
  pos: Vector2;
  radius: number;
  maxRadius: number;
  life: number;
  ownerId: string;
  type: GrenadeType; // To distinguish flash/fire
}

export interface FireZone {
  id: string;
  pos: Vector2;
  radius: number;
  life: number;
  ownerId: string;
}

export interface MapData {
  grid: number[][]; // 0 = floor, 1 = wall
  tileSize: number;
  width: number;
  height: number;
  spawns: Vector2[]; // Generic spawns
  teamSpawns: { [key in Team]: Vector2[] }; // Specific team spawns
}

export interface KillEvent {
  killer: string;
  assister?: string; // Name of assister
  victim: string;
  weapon: string; // Enum string
  time: number;
}

// Multiplayer Types
export interface NetInput {
  keys: string[]; // Set serialized to array
  mouse: Vector2;
  camX: number;
  camY: number;
  width: number;
  height: number;
}

export interface NetState {
  players: Player[];
  projectiles: Projectile[];
  grenades: GrenadeProjectile[];
  explosions: Explosion[];
  fireZones: FireZone[];
  particles: Particle[];
  screenshake: number;
  killFeed: KillEvent[];
  teamScores: { [key in Team]: number };
}
