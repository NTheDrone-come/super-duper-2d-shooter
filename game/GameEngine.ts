
import { 
  Entity, Player, Projectile, Particle, MapData, Vector2, 
  WeaponType, Explosion, KillEvent, GrenadeType, GrenadeProjectile, FireZone,
  NetInput, NetState, WeaponState, GameMode, Team, GameConfig
} from '../types';
import { TILE_SIZE, PLAYER_RADIUS, WEAPONS, GRENADES, PLAYER_SPEED, MAX_HP, BOT_NAMES, GRENADE_REGEN_TIME } from '../constants';

export class GameEngine {
  players: Player[] = [];
  projectiles: Projectile[] = [];
  grenades: GrenadeProjectile[] = [];
  explosions: Explosion[] = [];
  fireZones: FireZone[] = [];
  particles: Particle[] = [];
  killFeed: KillEvent[] = [];
  mapData: MapData;
  teamScores: { [key in Team]: number } = { [Team.BLUE]: 0, [Team.RED]: 0, [Team.NONE]: 0 };
  
  screenshake: number = 0;
  
  public isHost: boolean = true;
  public myId: string | null = null;
  public config: GameConfig;

  public onGameOver: ((winner: string) => void) | null = null;
  public onKill: ((event: KillEvent) => void) | null = null;
  
  private gameOverTriggered = false;
  private roundInProgress = true;
  private roundEndTimer = 0;

  constructor(mapGrid: number[][], playerName: string, isHost: boolean = true, existingPlayers: Player[] = [], config: GameConfig) {
    this.mapData = {
      grid: mapGrid,
      tileSize: TILE_SIZE,
      width: mapGrid[0].length,
      height: mapGrid.length,
      spawns: this.findSpawns(mapGrid),
      teamSpawns: this.findTeamSpawns(mapGrid)
    };
    this.isHost = isHost;
    this.config = config;

    if (existingPlayers.length > 0) {
      this.players = existingPlayers;
    } else {
      this.initGame(playerName);
    }
  }

  // --- NETWORKING HELPERS ---
  public getState(): NetState {
    return {
      players: this.players,
      projectiles: this.projectiles,
      grenades: this.grenades,
      explosions: this.explosions,
      fireZones: this.fireZones,
      particles: this.particles,
      screenshake: this.screenshake,
      killFeed: this.killFeed,
      teamScores: this.teamScores
    };
  }

  public applyState(state: NetState) {
    this.players = state.players;
    this.projectiles = state.projectiles;
    this.grenades = state.grenades;
    this.explosions = state.explosions;
    this.fireZones = state.fireZones;
    this.particles = state.particles;
    this.screenshake = state.screenshake;
    this.killFeed = state.killFeed;
    this.teamScores = state.teamScores;
  }
  // --------------------------

  private findSpawns(grid: number[][]): Vector2[] {
    const spawns: Vector2[] = [];
    for(let y = 1; y < grid.length - 1; y++) {
      for(let x = 1; x < grid[0].length - 1; x++) {
        if(grid[y][x] === 0 && grid[y+1][x] === 0 && grid[y][x+1] === 0) {
             spawns.push({ x: x * TILE_SIZE + TILE_SIZE/2, y: y * TILE_SIZE + TILE_SIZE/2 });
        }
      }
    }
    return spawns;
  }
  
  private findTeamSpawns(grid: number[][]): { [key in Team]: Vector2[] } {
      const spawns: { [key in Team]: Vector2[] } = { [Team.BLUE]: [], [Team.RED]: [], [Team.NONE]: [] };
      const width = grid[0].length;
      const allSpawns = this.findSpawns(grid);
      allSpawns.forEach(s => {
          if (s.x < (width * TILE_SIZE) / 2) spawns[Team.BLUE].push(s);
          else spawns[Team.RED].push(s);
          spawns[Team.NONE].push(s);
      });
      return spawns;
  }

  private initGame(playerName: string) {
    const isTeamMode = this.config.isTeamDeathmatch || this.config.gameMode === GameMode.ELIMINATION;
    
    // Host is Blue or None if FFA
    const myTeam = isTeamMode ? Team.BLUE : Team.NONE;
    const myPlayer = this.spawnPlayer(playerName, false, myTeam);
    this.myId = myPlayer.id;

    if (this.isHost && this.config.botsEnabled) {
      if (this.config.gameMode === GameMode.ELIMINATION) {
          // Allies
          for (let i = 0; i < this.config.allyCount; i++) {
              this.spawnPlayer(BOT_NAMES[i % BOT_NAMES.length], true, Team.BLUE);
          }
          // Enemies
          for (let i = 0; i < this.config.enemyCount; i++) {
              this.spawnPlayer(BOT_NAMES[(i + 4) % BOT_NAMES.length], true, Team.RED);
          }
      } else {
          // Deathmatch
          if (isTeamMode) {
               // Default 3v3 ish
               for (let i = 0; i < 2; i++) this.spawnPlayer(BOT_NAMES[i], true, Team.BLUE);
               for (let i = 0; i < 3; i++) this.spawnPlayer(BOT_NAMES[i+2], true, Team.RED);
          } else {
               // FFA: Add 5 bots with No Team
               for (let i = 0; i < 5; i++) this.spawnPlayer(BOT_NAMES[i], true, Team.NONE);
          }
      }
    }
  }

  public addRemotePlayer(id: string, name: string): Player {
    const isTeamMode = this.config.isTeamDeathmatch || this.config.gameMode === GameMode.ELIMINATION;
    let team = Team.NONE;
    if (isTeamMode) {
        const blueCount = this.players.filter(p => p.team === Team.BLUE).length;
        const redCount = this.players.filter(p => p.team === Team.RED).length;
        team = blueCount <= redCount ? Team.BLUE : Team.RED;
    }
    const p = this.spawnPlayer(name, false, team);
    p.id = id; 
    return p;
  }

  public removePlayer(id: string) {
    this.players = this.players.filter(p => p.id !== id);
  }

  private spawnPlayer(name: string, isBot: boolean, team: Team): Player {
    const teamSpawns = this.mapData.teamSpawns[team].length > 0 ? this.mapData.teamSpawns[team] : this.mapData.spawns;
    const spawn = teamSpawns[Math.floor(Math.random() * teamSpawns.length)];
    
    const weaponStates: { [key in WeaponType]: WeaponState } = {
        [WeaponType.MAGIC_WAND]: { currentAmmo: WEAPONS.MAGIC_WAND.clipSize, isReloading: false, reloadTimer: 0 },
        [WeaponType.AWP]: { currentAmmo: WEAPONS.AWP.clipSize, isReloading: false, reloadTimer: 0 }
    };

    let color = '#ffffff';
    if (team === Team.BLUE) color = '#3b82f6';
    else if (team === Team.RED) color = '#ef4444';
    else color = isBot ? '#f472b6' : '#a855f7'; 

    const player: Player = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      team,
      pos: { ...spawn },
      vel: { x: 0, y: 0 },
      radius: PLAYER_RADIUS,
      color: color,
      isDead: false,
      hp: MAX_HP,
      maxHp: MAX_HP,
      weapon: WeaponType.MAGIC_WAND,
      selectedGrenade: GrenadeType.HE,
      rotation: 0,
      isBot,
      score: 0,
      grenades: { [GrenadeType.HE]: 1, [GrenadeType.FLASH]: 1, [GrenadeType.MOLOTOV]: 1 },
      grenadeCooldowns: { [GrenadeType.HE]: 0, [GrenadeType.FLASH]: 0, [GrenadeType.MOLOTOV]: 0 },
      weaponStates: weaponStates,
      lastShotTime: 0,
      lastGrenadeTime: 0,
      flashIntensity: 0,
      aiState: 'IDLE',
      aiStrafeDir: 0,
      aiStrafeTimer: 0,
      aiLastKnownPos: null,
      respawnTimer: 0,
      damageHistory: []
    };
    this.players.push(player);
    return player;
  }

  private startNewRound() {
      // Respawns all players at their TEAM spawn locations (opposite ends)
      this.players.forEach(p => this.respawnEntity(p));
      this.projectiles = [];
      this.grenades = [];
      this.fireZones = [];
      this.explosions = [];
      this.roundInProgress = true;
      // Flash 'ROUND START'
      this.screenshake = 5;
  }

  public update(dt: number, input: NetInput, playerId: string | null = null) {
    if (!this.isHost || this.gameOverTriggered) return;

    if (this.screenshake > 0) this.screenshake = Math.max(0, this.screenshake - dt * 30);

    // --- GAME MODE LOGIC ---
    if (this.config.gameMode === GameMode.ELIMINATION) {
        if (this.roundInProgress) {
            const blueAlive = this.players.filter(p => p.team === Team.BLUE && !p.isDead).length;
            const redAlive = this.players.filter(p => p.team === Team.RED && !p.isDead).length;

            let roundWinner: Team | null = null;
            if (blueAlive === 0 && redAlive > 0) roundWinner = Team.RED;
            else if (redAlive === 0 && blueAlive > 0) roundWinner = Team.BLUE;
            else if (redAlive === 0 && blueAlive === 0 && this.players.length > 0) roundWinner = Team.NONE;

            if (roundWinner) {
                this.roundInProgress = false;
                this.roundEndTimer = 3000; // 3 seconds before next round
                if (roundWinner !== Team.NONE) this.teamScores[roundWinner]++;
            }
        } else {
            this.roundEndTimer -= dt * 16.6;
            if (this.roundEndTimer <= 0) {
                // Check Match Win
                const roundsToWin = this.config.roundsToWin;
                if (this.teamScores[Team.BLUE] >= roundsToWin) this.triggerGameOver('BLUE TEAM');
                else if (this.teamScores[Team.RED] >= roundsToWin) this.triggerGameOver('RED TEAM');
                else this.startNewRound();
            }
        }
    } else {
        // DEATHMATCH
        if (this.config.isTeamDeathmatch) {
             if (this.teamScores[Team.BLUE] >= 20) this.triggerGameOver('BLUE TEAM');
             if (this.teamScores[Team.RED] >= 20) this.triggerGameOver('RED TEAM');
        } else {
             // FFA
             const winner = this.players.find(p => p.score >= 15);
             if (winner) this.triggerGameOver(winner.name.toUpperCase());
        }
    }
    
    // Update Players
    this.players.forEach(p => {
      // RESPAWN LOGIC
      if (p.isDead) {
          if (this.config.gameMode === GameMode.DEATHMATCH) {
              p.respawnTimer -= dt * 16.6;
              if (p.respawnTimer <= 0) {
                 this.respawnEntity(p);
              }
          }
          return;
      }
      
      this.updatePlayerStatus(p, dt);

      if (p.id === playerId || (!playerId && p.id === this.myId)) {
        this.updatePlayerInput(p, dt, input);
      } else if (p.isBot) {
        this.updateBotAI(p, dt);
      }

      this.updatePlayerPhysics(p, dt);
    });

    // Update Projectiles
    this.projectiles.forEach(p => this.updateProjectile(p, dt));
    this.projectiles = this.projectiles.filter(p => !p.isDead);

    // Update Grenades
    this.grenades.forEach(g => this.updateGrenade(g, dt));
    this.grenades = this.grenades.filter(g => !g.isDead);

    // Update Explosions
    this.explosions.forEach(e => {
        e.life -= dt;
    });
    this.explosions = this.explosions.filter(e => e.life > 0);

    // Update Fire Zones
    this.fireZones.forEach(f => {
      f.life -= dt * 16.6;
      if (f.life % 10 < 1) {
        this.players.forEach(p => {
          if (p.isDead) return;
          const owner = this.players.find(pl => pl.id === f.ownerId);
          if (owner && owner.team === p.team && owner.id !== p.id && owner.team !== Team.NONE) return; // No friendly fire

          const dist = Math.hypot(p.pos.x - f.pos.x, p.pos.y - f.pos.y);
          if (dist < f.radius + p.radius) {
            this.damagePlayer(p, GRENADES.MOLOTOV.dps, f.ownerId, GrenadeType.MOLOTOV);
          }
        });
      }
      if (Math.random() > 0.8) {
         this.particles.push({
           pos: { x: f.pos.x + (Math.random()-0.5)*f.radius, y: f.pos.y + (Math.random()-0.5)*f.radius },
           vel: { x: 0, y: -1 },
           life: 20, maxLife: 20, size: Math.random()*5+2, color: '#f97316', alpha: 0.8, decay: 0.05
         });
      }
    });
    this.fireZones = this.fireZones.filter(f => f.life > 0);

    // Update Particles
    this.particles.forEach(p => {
      p.pos.x += p.vel.x * dt;
      p.pos.y += p.vel.y * dt;
      p.life -= dt;
      p.alpha = Math.max(0, p.life / p.maxLife);
    });
    this.particles = this.particles.filter(p => p.life > 0);
  }

  private respawnEntity(p: Player) {
     const teamSpawns = this.mapData.teamSpawns[p.team].length > 0 ? this.mapData.teamSpawns[p.team] : this.mapData.spawns;
     const spawn = teamSpawns[Math.floor(Math.random() * teamSpawns.length)];
     p.isDead = false;
     p.hp = MAX_HP;
     p.pos = { ...spawn };
     p.flashIntensity = 0;
     p.weaponStates[WeaponType.MAGIC_WAND].currentAmmo = WEAPONS.MAGIC_WAND.clipSize;
     p.weaponStates[WeaponType.MAGIC_WAND].isReloading = false;
     p.weaponStates[WeaponType.AWP].currentAmmo = WEAPONS.AWP.clipSize;
     p.weaponStates[WeaponType.AWP].isReloading = false;
     p.grenades = { [GrenadeType.HE]: 1, [GrenadeType.FLASH]: 1, [GrenadeType.MOLOTOV]: 1 };
     p.grenadeCooldowns = { [GrenadeType.HE]: 0, [GrenadeType.FLASH]: 0, [GrenadeType.MOLOTOV]: 0 };
     p.damageHistory = [];
     if (p.isBot) {
         p.aiState = 'IDLE';
         p.aiTargetId = null;
         p.aiLastKnownPos = null;
     }
     this.addParticles(p.pos, 20, '#ffffff', 2);
  }

  private triggerGameOver(winner: string) {
      if (this.gameOverTriggered) return;
      this.gameOverTriggered = true;
      if (this.onGameOver) this.onGameOver(winner);
  }

  private updatePlayerStatus(p: Player, dt: number) {
      const gTypes = [GrenadeType.HE, GrenadeType.FLASH, GrenadeType.MOLOTOV];
      gTypes.forEach(g => {
          if (p.grenadeCooldowns[g] > 0) {
              p.grenadeCooldowns[g] -= dt * 16.6;
              if (p.grenadeCooldowns[g] <= 0) {
                  p.grenadeCooldowns[g] = 0;
                  p.grenades[g] = Math.min(p.grenades[g] + 1, 1); 
              }
          }
      });

      const ws = p.weaponStates[p.weapon];
      if (ws.isReloading) {
          ws.reloadTimer -= dt * 16.6;
          if (ws.reloadTimer <= 0) {
              ws.isReloading = false;
              ws.currentAmmo = WEAPONS[p.weapon].clipSize;
          }
      }
  }

  private updatePlayerInput(p: Player, dt: number, input: NetInput) {
    const keys = new Set(input.keys);
    
    if (keys.has('Digit1')) p.weapon = WeaponType.MAGIC_WAND;
    if (keys.has('Digit2')) p.weapon = WeaponType.AWP;
    if (keys.has('Digit3')) p.selectedGrenade = GrenadeType.HE;
    if (keys.has('Digit4')) p.selectedGrenade = GrenadeType.FLASH;
    if (keys.has('Digit5')) p.selectedGrenade = GrenadeType.MOLOTOV;
    if (keys.has('KeyR')) this.startReload(p);

    let dx = 0, dy = 0;
    if (keys.has('KeyW')) dy -= 1;
    if (keys.has('KeyS')) dy += 1;
    if (keys.has('KeyA')) dx -= 1;
    if (keys.has('KeyD')) dx += 1;

    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      p.vel.x = (dx / len) * PLAYER_SPEED;
      p.vel.y = (dy / len) * PLAYER_SPEED;
    } else {
      p.vel.x = 0;
      p.vel.y = 0;
    }

    const screenX = p.pos.x - input.camX;
    const screenY = p.pos.y - input.camY;
    p.rotation = Math.atan2(input.mouse.y - screenY, input.mouse.x - screenX);

    if (keys.has('mouse_left')) this.tryShoot(p);
    
    if (keys.has('KeyG') || keys.has('mouse_right')) {
        const worldMouseX = input.mouse.x + input.camX;
        const worldMouseY = input.mouse.y + input.camY;
        this.tryThrowGrenade(p, { x: worldMouseX, y: worldMouseY });
    }
  }

  private checkLineOfSight(p1: Vector2, p2: Vector2): boolean {
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const steps = Math.ceil(dist / (TILE_SIZE / 2));
    const dx = (p2.x - p1.x) / steps;
    const dy = (p2.y - p1.y) / steps;

    for (let i = 1; i < steps; i++) {
        const checkX = p1.x + dx * i;
        const checkY = p1.y + dy * i;
        const tx = Math.floor(checkX / TILE_SIZE);
        const ty = Math.floor(checkY / TILE_SIZE);
        if (ty >= 0 && ty < this.mapData.height && tx >= 0 && tx < this.mapData.width) {
            if (this.mapData.grid[ty][tx] === 1) return false;
        }
    }
    return true;
  }

  private updateBotAI(p: Player, dt: number) {
     if (p.flashIntensity > 0.8) {
       p.vel.x = 0; p.vel.y = 0;
       p.flashIntensity -= dt * 0.01;
       return;
     }

     const ws = p.weaponStates[p.weapon];
     if (ws.currentAmmo <= 0 && !ws.isReloading) this.startReload(p);

     // Target Logic: In FFA (Team.NONE), everyone is enemy. In Teams, different team.
     const enemies = this.players.filter(e => {
        if (e.isDead || e.id === p.id) return false;
        if (p.team === Team.NONE) return true; // FFA: Everyone else is enemy
        return e.team !== p.team;
     });
     
     let visibleTarget = null;
     let minDist = Infinity;
     
     if (p.aiTargetId) {
         const current = enemies.find(e => e.id === p.aiTargetId);
         if (current && this.checkLineOfSight(p.pos, current.pos)) visibleTarget = current;
     }

     if (!visibleTarget) {
         // Aggressive searching: Check ALL enemies for line of sight, not just close ones
         for(const e of enemies) {
           const d = Math.hypot(e.pos.x - p.pos.x, e.pos.y - p.pos.y);
           // Removed the d < 600 restriction to make bots more aggressive
           if(this.checkLineOfSight(p.pos, e.pos)) { 
               if(d < minDist) { minDist = d; visibleTarget = e; }
           }
         }
     }

     if (visibleTarget) {
         p.aiState = 'CHASING';
         p.aiTargetId = visibleTarget.id;
         p.aiLastKnownPos = { ...visibleTarget.pos };
         p.aiPatrolPoint = null; 
     } else {
         if (p.aiState === 'CHASING') {
             p.aiState = 'INVESTIGATING';
             p.aiPatrolPoint = p.aiLastKnownPos ? { ...p.aiLastKnownPos } : { ...p.pos };
             p.aiStrafeTimer = 0; 
         }
     }

     if (p.aiState === 'CHASING' && visibleTarget) {
         const angleToTarget = Math.atan2(visibleTarget.pos.y - p.pos.y, visibleTarget.pos.x - p.pos.x);
         p.rotation = angleToTarget;
         let moveX = 0, moveY = 0;
         const optimalDist = p.weapon === WeaponType.AWP ? 500 : 250;
         const d = Math.hypot(visibleTarget.pos.x - p.pos.x, visibleTarget.pos.y - p.pos.y);

         if (p.hp < 30 || ws.isReloading) {
             // CAREFUL BEHAVIOR when low HP
             if (ws.isReloading) {
                 moveX = -Math.cos(angleToTarget);
                 moveY = -Math.sin(angleToTarget);
             } else {
                 // Aggressive but careful: Strafe and keep distance, don't just run
                 const strafe = (p.aiStrafeDir || (Math.random() < 0.5 ? 1 : -1));
                 // Move perpendicular to target (strafe)
                 moveX = -Math.sin(angleToTarget) * strafe;
                 moveY = Math.cos(angleToTarget) * strafe;
                 
                 // If too close, back up
                 if (d < 300) {
                     moveX -= Math.cos(angleToTarget) * 0.8;
                     moveY -= Math.sin(angleToTarget) * 0.8;
                 } else if (d > 500) {
                     // If too far, close in slightly while strafing
                     moveX += Math.cos(angleToTarget) * 0.5;
                     moveY += Math.sin(angleToTarget) * 0.5;
                 }
             }
         } else {
             if (d < optimalDist - 50) { moveX = -Math.cos(angleToTarget); moveY = -Math.sin(angleToTarget); }
             else if (d > optimalDist + 50) { moveX = Math.cos(angleToTarget); moveY = Math.sin(angleToTarget); }

             if (!p.aiStrafeTimer || p.aiStrafeTimer <= 0) {
                 const r = Math.random();
                 if (r < 0.4) p.aiStrafeDir = -1;
                 else if (r < 0.8) p.aiStrafeDir = 1;
                 else p.aiStrafeDir = 0;
                 p.aiStrafeTimer = 30 + Math.random() * 60;
             } else {
                 p.aiStrafeTimer -= dt;
             }
             if (p.aiStrafeDir !== 0) {
                 moveX += -Math.sin(angleToTarget) * (p.aiStrafeDir || 0);
                 moveY += Math.cos(angleToTarget) * (p.aiStrafeDir || 0);
             }
             if (!ws.isReloading && Math.random() < 0.05 && Math.abs(d - optimalDist) < 200) this.tryShoot(p);
             
             if (Math.random() < 0.005) {
                 const gTypes = [GrenadeType.HE, GrenadeType.MOLOTOV, GrenadeType.FLASH];
                 p.selectedGrenade = gTypes[Math.floor(Math.random()*3)];
                 this.tryThrowGrenade(p, visibleTarget.pos);
             }
         }
         
         const len = Math.hypot(moveX, moveY);
         if (len > 0) {
             p.vel.x = (moveX / len) * PLAYER_SPEED;
             p.vel.y = (moveY / len) * PLAYER_SPEED;
         }
     } 
     else if (p.aiState === 'INVESTIGATING' && p.aiPatrolPoint) {
         // Move quickly to investigation point
         const d = Math.hypot(p.aiPatrolPoint.x - p.pos.x, p.aiPatrolPoint.y - p.pos.y);
         if (d > 10) {
             const angle = Math.atan2(p.aiPatrolPoint.y - p.pos.y, p.aiPatrolPoint.x - p.pos.x);
             p.rotation = angle;
             p.vel.x = Math.cos(angle) * PLAYER_SPEED;
             p.vel.y = Math.sin(angle) * PLAYER_SPEED;
         } else {
             p.vel.x = 0;
             p.vel.y = 0;
             p.rotation += dt * 0.1;
             if (!p.aiStrafeTimer) p.aiStrafeTimer = 100;
             p.aiStrafeTimer -= dt;
             if (p.aiStrafeTimer <= 0) {
                 p.aiState = 'SEARCHING';
                 p.aiPatrolPoint = null; 
             }
         }
     }
     else {
         // SEARCHING / IDLE -> Patrolling
         if (!p.aiPatrolPoint || (Math.abs(p.pos.x - p.aiPatrolPoint.x) < 10 && Math.abs(p.pos.y - p.aiPatrolPoint.y) < 10)) {
             // Pick a point further away for aggressive searching
             const randomAngle = Math.random() * Math.PI * 2;
             const dist = 300 + Math.random() * 400; // Larger patrol radius
             p.aiPatrolPoint = {
                 x: p.pos.x + Math.cos(randomAngle) * dist,
                 y: p.pos.y + Math.sin(randomAngle) * dist
             };
         }
         const angle = Math.atan2(p.aiPatrolPoint.y - p.pos.y, p.aiPatrolPoint.x - p.pos.x);
         p.rotation = angle;
         p.vel.x = Math.cos(angle) * (PLAYER_SPEED * 0.8); // Move faster while patrolling
         p.vel.y = Math.sin(angle) * (PLAYER_SPEED * 0.8);
     }
  }

  private updatePlayerPhysics(p: Player, dt: number) {
      if (p.flashIntensity > 0) p.flashIntensity = Math.max(0, p.flashIntensity - dt * 0.02);
      const nextX = p.pos.x + p.vel.x * dt;
      const nextY = p.pos.y + p.vel.y * dt;
      if (!this.checkCollision(nextX, p.pos.y, p.radius)) p.pos.x = nextX;
      if (!this.checkCollision(p.pos.x, nextY, p.radius)) p.pos.y = nextY;
  }

  private checkCollision(x: number, y: number, r: number): boolean {
    const minX = Math.floor((x - r) / TILE_SIZE);
    const maxX = Math.floor((x + r) / TILE_SIZE);
    const minY = Math.floor((y - r) / TILE_SIZE);
    const maxY = Math.floor((y + r) / TILE_SIZE);

    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        if (ty >= 0 && ty < this.mapData.height && tx >= 0 && tx < this.mapData.width) {
          if (this.mapData.grid[ty][tx] === 1) return true;
        }
      }
    }
    return false;
  }

  private startReload(p: Player) {
      const ws = p.weaponStates[p.weapon];
      const stats = WEAPONS[p.weapon];
      if (!ws.isReloading && ws.currentAmmo < stats.clipSize) {
          ws.isReloading = true;
          ws.reloadTimer = stats.reloadTime;
      }
  }

  private tryShoot(p: Player) {
    const ws = p.weaponStates[p.weapon];
    if (ws.isReloading || ws.currentAmmo <= 0) {
        if (ws.currentAmmo <= 0) this.startReload(p);
        return;
    }

    const now = Date.now();
    const weaponStats = WEAPONS[p.weapon];
    
    if (now - p.lastShotTime >= weaponStats.fireRate) {
        p.lastShotTime = now;
        ws.currentAmmo--;
        if (p.weapon === WeaponType.AWP) this.screenshake = 10;
        
        const spread = (Math.random() - 0.5) * weaponStats.spread;
        const angle = p.rotation + spread;
        const vx = Math.cos(angle) * weaponStats.speed;
        const vy = Math.sin(angle) * weaponStats.speed;

        this.projectiles.push({
            id: Math.random().toString(),
            ownerId: p.id,
            type: p.weapon,
            pos: { x: p.pos.x + Math.cos(p.rotation) * 20, y: p.pos.y + Math.sin(p.rotation) * 20 },
            vel: { x: vx, y: vy },
            radius: 3,
            color: weaponStats.color,
            isDead: false,
            damage: weaponStats.damage,
            lifeTime: 100
        });
        this.addParticles(p.pos, 3, weaponStats.color, 2);
    }
  }

  private tryThrowGrenade(p: Player, targetPos: Vector2) {
      const now = Date.now();
      const stats = GRENADES[p.selectedGrenade];
      if (p.grenades[p.selectedGrenade] > 0 && now - p.lastGrenadeTime > stats.throwDelay) {
          p.lastGrenadeTime = now;
          p.grenades[p.selectedGrenade]--;
          if (p.grenades[p.selectedGrenade] === 0) p.grenadeCooldowns[p.selectedGrenade] = GRENADE_REGEN_TIME;

          const vx = Math.cos(p.rotation) * stats.speed;
          const vy = Math.sin(p.rotation) * stats.speed;
          
          let grenadeTarget: Vector2 | undefined = undefined;
          
          if (p.selectedGrenade === GrenadeType.MOLOTOV) {
              const maxDist = 350; 
              const dx = targetPos.x - p.pos.x;
              const dy = targetPos.y - p.pos.y;
              const dist = Math.hypot(dx, dy);
              
              if (dist > maxDist) {
                   const angle = Math.atan2(dy, dx);
                   grenadeTarget = { 
                       x: p.pos.x + Math.cos(angle) * maxDist, 
                       y: p.pos.y + Math.sin(angle) * maxDist 
                   };
              } else {
                   grenadeTarget = { ...targetPos };
              }
          }

          this.grenades.push({
              id: Math.random().toString(),
              type: p.selectedGrenade,
              ownerId: p.id,
              pos: { x: p.pos.x, y: p.pos.y },
              vel: { x: vx, y: vy },
              radius: 4,
              color: stats.color,
              isDead: false,
              lifeTime: stats.fuse,
              targetPos: grenadeTarget
          });
      }
  }

  private updateProjectile(proj: Projectile, dt: number) {
    proj.pos.x += proj.vel.x * dt;
    proj.pos.y += proj.vel.y * dt;
    proj.lifeTime -= dt;

    if (proj.lifeTime <= 0) { proj.isDead = true; return; }
    if (this.checkCollision(proj.pos.x, proj.pos.y, 2)) {
        proj.isDead = true;
        this.addParticles(proj.pos, 5, '#ffffff', 2);
        return;
    }

    for (const player of this.players) {
        if (player.id === proj.ownerId || player.isDead) continue;
        const owner = this.players.find(p => p.id === proj.ownerId);
        
        // Friendly Fire Check (except in FFA)
        if (owner && owner.team === player.team && owner.team !== Team.NONE) continue;

        const dist = Math.hypot(player.pos.x - proj.pos.x, player.pos.y - proj.pos.y);
        if (dist < player.radius + proj.radius) {
            proj.isDead = true;
            this.damagePlayer(player, proj.damage, proj.ownerId, proj.type);
            this.addParticles(proj.pos, 10, '#ff0000', 3);
            break;
        }
    }
  }

  private updateGrenade(g: GrenadeProjectile, dt: number) {
     const isMolotov = g.type === GrenadeType.MOLOTOV;

     if (isMolotov && g.targetPos) {
        // Move towards target without friction
        g.pos.x += g.vel.x * dt;
        g.pos.y += g.vel.y * dt;
        
        // Check arrival
        const dx = g.targetPos.x - g.pos.x;
        const dy = g.targetPos.y - g.pos.y;
        const dist = Math.hypot(dx, dy);
        
        // If we overshot or are very close
        const speed = Math.hypot(g.vel.x, g.vel.y);
        if (dist < speed * dt * 1.5 || dist < 5) {
            g.pos.x = g.targetPos.x;
            g.pos.y = g.targetPos.y;
            g.isDead = true;
            this.detonateGrenade(g);
            return;
        }
        
        // Wall check (explode if hits wall mid-flight)
        if (this.checkCollision(g.pos.x, g.pos.y, 2)) {
            g.isDead = true;
            this.detonateGrenade(g);
            return;
        }

     } else {
         // Standard physics for other grenades
         g.pos.x += g.vel.x * dt;
         g.pos.y += g.vel.y * dt;
         g.vel.x *= 0.95;
         g.vel.y *= 0.95;
         
         if(this.checkCollision(g.pos.x + g.vel.x*dt, g.pos.y, 4)) g.vel.x *= -0.6;
         if(this.checkCollision(g.pos.x, g.pos.y + g.vel.y*dt, 4)) g.vel.y *= -0.6;
     }

     g.lifeTime -= dt * 16.6; 
     const speed = Math.hypot(g.vel.x, g.vel.y);
     
     if (g.lifeTime <= 0 || (isMolotov && !g.targetPos && speed < 1 && g.lifeTime < GRENADES.MOLOTOV.fuse - 200)) {
         g.isDead = true;
         this.detonateGrenade(g);
     }
  }

  private detonateGrenade(g: GrenadeProjectile) {
      const stats = GRENADES[g.type];
      this.explosions.push({
          pos: g.pos, radius: 1, maxRadius: stats.radius, life: 20, ownerId: g.ownerId, type: g.type
      });
      this.screenshake = 15;

      if (g.type === GrenadeType.MOLOTOV) {
          this.fireZones.push({ id: Math.random().toString(), pos: { ...g.pos }, radius: stats.radius, life: GRENADES.MOLOTOV.duration, ownerId: g.ownerId });
          return; 
      }

      this.players.forEach(p => {
          if (p.isDead) return;
          const owner = this.players.find(pl => pl.id === g.ownerId);
          // Friendly Fire Logic
          if (g.type === GrenadeType.HE && owner && owner.team === p.team && owner.team !== Team.NONE && owner.id !== p.id) return;

          const dist = Math.hypot(p.pos.x - g.pos.x, p.pos.y - g.pos.y);
          if (g.type === GrenadeType.FLASH) {
              if (dist < stats.radius && this.checkLineOfSight(g.pos, p.pos)) p.flashIntensity = 1.0;
          } else if (g.type === GrenadeType.HE) {
              if (dist < stats.radius) {
                  const damage = GRENADES.HE.damage * (1 - dist/stats.radius);
                  this.damagePlayer(p, damage, g.ownerId, GrenadeType.HE);
              }
          }
      });
  }

  private damagePlayer(target: Player, damage: number, attackerId: string, weaponName: string) {
    if (target.isDead) return;
    target.hp -= damage;
    
    // Record Damage for Assist Logic
    const now = Date.now();
    target.damageHistory.push({ attackerId, damage, timestamp: now });
    // Keep history clean (remove older than 10s)
    target.damageHistory = target.damageHistory.filter(h => now - h.timestamp < 10000);

    if (target.isBot && !target.isDead) {
        target.aiState = 'CHASING';
        target.aiTargetId = attackerId;
        target.aiStrafeTimer = 0; 
    }

    if (target.hp <= 0 && !target.isDead) {
        target.hp = 0;
        target.isDead = true;
        
        // Deathmatch Timer
        if (this.config.gameMode === GameMode.DEATHMATCH) {
            target.respawnTimer = 2000; // 2 seconds
        }

        const attacker = this.players.find(p => p.id === attackerId);
        
        // Calculate Assist
        // Find damage sources from teammates of attacker (or anyone in FFA) excluding the attacker themselves
        // Threshold: 25 damage
        let assisterName: string | undefined = undefined;
        if (attacker) {
            const assistRecord = target.damageHistory
                .filter(h => h.attackerId !== attackerId) // Not the killer
                .filter(h => {
                    const helper = this.players.find(p => p.id === h.attackerId);
                    if (!helper) return false;
                    // In team mode, only count teammates. In FFA, count anyone else.
                    if (this.config.gameMode !== GameMode.DEATHMATCH || this.config.isTeamDeathmatch) {
                        return helper.team === attacker.team && helper.team !== Team.NONE;
                    } 
                    return true; // FFA anyone can assist by lowering HP
                })
                .reduce((prev, curr) => {
                     // Sum damage per attacker
                     const existing = prev.find(p => p.id === curr.attackerId);
                     if (existing) existing.dmg += curr.damage;
                     else prev.push({ id: curr.attackerId, dmg: curr.damage });
                     return prev;
                }, [] as {id: string, dmg: number}[])
                .filter(rec => rec.dmg >= 25)
                .sort((a, b) => b.dmg - a.dmg)[0]; // Highest damage dealer gets assist

            if (assistRecord) {
                const helper = this.players.find(p => p.id === assistRecord.id);
                if (helper) assisterName = helper.name;
            }
        }

        if (attacker) {
            attacker.score++;
            // ONLY increment Team Score if NOT Elimination mode.
            // In Elimination, score is incremented when the round ends.
            if (this.config.gameMode !== GameMode.ELIMINATION && attacker.team !== Team.NONE) {
                 this.teamScores[attacker.team]++;
            }
            if (this.onKill) {
                this.onKill({ 
                    killer: attacker.name, 
                    victim: target.name, 
                    weapon: weaponName, 
                    time: Date.now(),
                    assister: assisterName
                });
            }
        }
        
        // Clear history on death
        target.damageHistory = [];
        this.addParticles(target.pos, 40, target.color, 4);
    }
  }

  private addParticles(pos: Vector2, count: number, color: string, speed: number) {
      for(let i=0; i<count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const v = Math.random() * speed;
          this.particles.push({
              pos: { ...pos },
              vel: { x: Math.cos(angle) * v, y: Math.sin(angle) * v },
              life: 30 + Math.random() * 20,
              maxLife: 50,
              size: Math.random() * 3 + 1,
              color: color,
              alpha: 1,
              decay: 0.02
          });
      }
  }
}
