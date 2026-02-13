
export const TILE_SIZE = 40;
export const MAP_WIDTH = 40; // Slightly larger for better fights
export const MAP_HEIGHT = 25;

export const PLAYER_SPEED = 4;
export const PLAYER_RADIUS = 15;
export const MAX_HP = 100;

export const GRENADE_REGEN_TIME = 15000; // 15 seconds

export const WEAPONS = {
  MAGIC_WAND: {
    fireRate: 150, // ms
    damage: 12,
    speed: 14,
    color: '#a855f7', // purple-500
    spread: 0.1,
    clipSize: 15,
    reloadTime: 1500,
  },
  AWP: {
    fireRate: 1500, // ms
    damage: 101, // One shot kill usually
    speed: 45, // Almost hitscan
    color: '#fbbf24', // amber-400
    spread: 0.0,
    recoil: 10,
    clipSize: 3,
    reloadTime: 3000,
  }
};

export const GRENADES = {
  HE: {
    throwDelay: 1000,
    damage: 90,
    radius: 150,
    fuse: 2000,
    color: '#22c55e',
    speed: 10
  },
  FLASH: {
    throwDelay: 1000,
    radius: 200, // 5 blocks (40 * 5)
    fuse: 1500,
    color: '#cbd5e1',
    speed: 12,
    duration: 3000 // ms blind
  },
  MOLOTOV: {
    throwDelay: 1000,
    radius: 80,
    fuse: 3000, // Safety fuse so it can fly
    duration: 5000, // Fire lasts 5s
    dps: 2, // Per frame damage roughly
    color: '#ea580c',
    speed: 10
  }
};

export const BOT_NAMES = [
  "ShadowSlayer", "NeonViper", "Glitch", "SniperWolf", "ManaAddict", 
  "GrenadeGod", "PixelRogue", "VoidWalker"
];
