
import React, { useEffect, useRef, useState } from 'react';
import { GameEngine } from '../game/GameEngine';
import { TILE_SIZE, WEAPONS, MAX_HP, GRENADES } from '../constants';
import { KillEvent, WeaponType, GrenadeType, NetInput, Player, WeaponState, GameMode, Team, GameConfig } from '../types';

interface GameCanvasProps {
  mapGrid: number[][];
  playerName: string;
  onGameOver: (winner: string) => void;
  isHost: boolean;
  peerInstance: any;
  initialConnections: any[];
  config: GameConfig;
  onExit: () => void;
}

const VIEW_RADIUS = 600;

// Helper for Killfeed Icons
const getWeaponIcon = (type: string) => {
    switch (type) {
        case WeaponType.MAGIC_WAND:
            return (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 2l-2.5 2.5" />
                    <path d="M11 5l-8 8a2.12 2.12 0 0 0 3 3l8-8" />
                    <path d="M18 2l3 3" />
                </svg>
            );
        case WeaponType.AWP:
            return (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <line x1="18" y1="9" x2="18" y2="15" />
                    <circle cx="12" cy="12" r="3" />
                </svg>
            );
        case GrenadeType.HE:
            return (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#22c55e" stroke="none">
                    <circle cx="12" cy="12" r="8" />
                    <path d="M12 2v4" stroke="black" strokeWidth="2" />
                </svg>
            );
        case GrenadeType.MOLOTOV:
            return (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ea580c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8.5 22h7" />
                    <path d="M12 2v20" />
                    <path d="M6 14s2-2 3-2 3 2 3 2" />
                    <path d="M12 14s2-2 3-2 3 2 3 2" />
                </svg>
            );
        case GrenadeType.FLASH:
            return (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="white" stroke="black" strokeWidth="1">
                     <polygon points="12 2 15 8 21 9 17 14 18 20 12 17 6 20 7 14 3 9 9 8" />
                </svg>
            );
        default:
            return <span className="text-[10px] uppercase font-bold text-slate-400">{type}</span>;
    }
};

const GameCanvas: React.FC<GameCanvasProps> = ({ mapGrid, playerName, onGameOver, isHost, peerInstance, initialConnections, config, onExit }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const requestRef = useRef<number>();
  
  const [hp, setHp] = useState(100);
  const [currentWeapon, setCurrentWeapon] = useState<WeaponType>(WeaponType.MAGIC_WAND);
  const [selectedGrenade, setSelectedGrenade] = useState<GrenadeType>(GrenadeType.HE);
  const [grenadeCounts, setGrenadeCounts] = useState<{ [key: string]: number }>({});
  const [grenadeCooldowns, setGrenadeCooldowns] = useState<{ [key: string]: number }>({});
  const [weaponState, setWeaponState] = useState<WeaponState>({ currentAmmo: 0, isReloading: false, reloadTimer: 0 });
  const [killFeed, setKillFeed] = useState<KillEvent[]>([]);
  const [flashAlpha, setFlashAlpha] = useState(0);
  const [respawnTimer, setRespawnTimer] = useState(0);
  const [teamScores, setTeamScores] = useState({ [Team.BLUE]: 0, [Team.RED]: 0 });
  const [spectatingName, setSpectatingName] = useState<string | null>(null);

  const keys = useRef<Set<string>>(new Set());
  const mouse = useRef({ x: 0, y: 0 });
  const peerRef = useRef<any>(peerInstance);
  const connectionsRef = useRef<any[]>(initialConnections); 
  const spectatingIdRef = useRef<string | null>(null);

  useEffect(() => {
    const engine = new GameEngine(mapGrid, playerName, isHost, [], config);
    engine.onGameOver = onGameOver;
    engine.onKill = (event) => setKillFeed(prev => [...prev.slice(-4), event]);
    
    if (peerRef.current) {
        const generatedId = engine.myId;
        engine.myId = peerRef.current.id;
        if (generatedId) {
            const myPlayer = engine.players.find(p => p.id === generatedId);
            if (myPlayer) myPlayer.id = peerRef.current.id;
        }
    } else {
        const generatedId = engine.myId;
        engine.myId = 'local-solo-player';
        if (generatedId) {
            const myPlayer = engine.players.find(p => p.id === generatedId);
            if (myPlayer) myPlayer.id = engine.myId;
        }
    }
    
    if (isHost && peerRef.current) {
        connectionsRef.current.forEach(conn => {
            if (conn.peer !== engine.myId) {
                engine.addRemotePlayer(conn.peer, 'Player ' + conn.peer.substr(0,4));
            }
        });
    }

    engineRef.current = engine;

    const handleData = (conn: any, data: any) => {
        if (!engineRef.current) return;
        if (isHost) {
            if (data.type === 'INPUT') engineRef.current.update(1, data.input, conn.peer);
        } else {
            if (data.type === 'UPDATE') engineRef.current.applyState(data.state);
        }
    };

    connectionsRef.current.forEach(conn => {
        conn.off('data');
        conn.on('data', (data: any) => handleData(conn, data));
        conn.on('close', () => { if (isHost && engineRef.current) engineRef.current.removePlayer(conn.peer); });
    });

    if (peerRef.current && isHost) {
        peerRef.current.on('connection', (conn: any) => {
             connectionsRef.current.push(conn);
             engineRef.current?.addRemotePlayer(conn.peer, 'Joiner');
             conn.on('data', (data: any) => handleData(conn, data));
        });
    }
  }, []);

  useEffect(() => {
      if (!canvasRef.current) return;
      const handleKeyDown = (e: KeyboardEvent) => keys.current.add(e.code);
      const handleKeyUp = (e: KeyboardEvent) => keys.current.delete(e.code);
      const handleMouseMove = (e: MouseEvent) => {
          const rect = canvasRef.current!.getBoundingClientRect();
          mouse.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      };
      const handleMouseDown = (e: MouseEvent) => {
          if (e.button === 0) keys.current.add('mouse_left');
          if (e.button === 2) keys.current.add('mouse_right');
      };
      const handleMouseUp = (e: MouseEvent) => {
          if (e.button === 0) keys.current.delete('mouse_left');
          if (e.button === 2) keys.current.delete('mouse_right');
      };
      const handleContextMenu = (e: MouseEvent) => e.preventDefault();

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      canvasRef.current.addEventListener('mousemove', handleMouseMove);
      canvasRef.current.addEventListener('mousedown', handleMouseDown);
      canvasRef.current.addEventListener('mouseup', handleMouseUp);
      canvasRef.current.addEventListener('contextmenu', handleContextMenu);

      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('keyup', handleKeyUp);
          if (canvasRef.current) {
             canvasRef.current.removeEventListener('mousemove', handleMouseMove);
             canvasRef.current.removeEventListener('mousedown', handleMouseDown);
             canvasRef.current.removeEventListener('mouseup', handleMouseUp);
             canvasRef.current.removeEventListener('contextmenu', handleContextMenu);
          }
      };
  }, []);

  const castRay = (startX: number, startY: number, angle: number, maxDist: number, grid: number[][]) => {
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);
      let mapX = Math.floor(startX / TILE_SIZE);
      let mapY = Math.floor(startY / TILE_SIZE);
      const deltaDistX = Math.abs(cos) < 1e-10 ? 1e30 : Math.abs(TILE_SIZE / cos);
      const deltaDistY = Math.abs(sin) < 1e-10 ? 1e30 : Math.abs(TILE_SIZE / sin);
      let stepX, stepY, sideDistX, sideDistY;
      
      if (cos < 0) { stepX = -1; sideDistX = (startX - mapX * TILE_SIZE) * (deltaDistX / TILE_SIZE); }
      else { stepX = 1; sideDistX = ((mapX + 1) * TILE_SIZE - startX) * (deltaDistX / TILE_SIZE); }
      if (sin < 0) { stepY = -1; sideDistY = (startY - mapY * TILE_SIZE) * (deltaDistY / TILE_SIZE); }
      else { stepY = 1; sideDistY = ((mapY + 1) * TILE_SIZE - startY) * (deltaDistY / TILE_SIZE); }
      
      let hit = false;
      let side = 0;
      const maxSteps = Math.ceil(maxDist / TILE_SIZE) * 2;
      let steps = 0;

      while (!hit && steps < maxSteps) {
          if (sideDistX < sideDistY) { sideDistX += deltaDistX; mapX += stepX; side = 0; }
          else { sideDistY += deltaDistY; mapY += stepY; side = 1; }
          if (mapY < 0 || mapY >= grid.length || mapX < 0 || mapX >= grid[0].length) hit = true;
          else if (grid[mapY][mapX] === 1) hit = true;
          steps++;
      }
      
      let endX, endY;
      if (hit) {
          if (side === 0) {
              const wallX = stepX > 0 ? mapX * TILE_SIZE : (mapX + 1) * TILE_SIZE;
              endX = wallX; endY = startY + (wallX - startX) * (sin / cos);
          } else {
              const wallY = stepY > 0 ? mapY * TILE_SIZE : (mapY + 1) * TILE_SIZE;
              endY = wallY; endX = startX + (wallY - startY) * (cos / sin);
          }
      } else {
          endX = startX + cos * maxDist; endY = startY + sin * maxDist;
      }
      return { x: endX, y: endY };
  };

  useEffect(() => {
    let lastTime = performance.now();
    const loop = (time: number) => {
        const dt = (time - lastTime) / 16.67;
        lastTime = time;
        const canvas = canvasRef.current;
        const engine = engineRef.current;
        if (!canvas || !engine) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const myPlayer = engine.players.find(p => p.id === engine.myId);
        let displayPlayer = myPlayer;
        let isSpectating = false;

        // SPECTATOR LOGIC
        if (myPlayer?.isDead && config.gameMode === GameMode.ELIMINATION) {
             const aliveTeammates = engine.players.filter(p => p.team === myPlayer.team && !p.isDead && p.id !== myPlayer.id);
             let currentSpec = engine.players.find(p => p.id === spectatingIdRef.current);
             
             if (!currentSpec || currentSpec.isDead) {
                 // Try finding a new target
                 if (aliveTeammates.length > 0) {
                     spectatingIdRef.current = aliveTeammates[0].id;
                     displayPlayer = aliveTeammates[0];
                 } else {
                     // No teammates, spectate anyone alive (enemies)
                     const aliveEnemies = engine.players.filter(p => !p.isDead);
                     if (aliveEnemies.length > 0) {
                         spectatingIdRef.current = aliveEnemies[0].id;
                         displayPlayer = aliveEnemies[0];
                     }
                 }
             } else {
                 displayPlayer = currentSpec;
             }
             isSpectating = !!displayPlayer && displayPlayer.id !== myPlayer.id;
        } else {
             spectatingIdRef.current = null;
        }

        if (displayPlayer && displayPlayer.id !== myPlayer?.id) {
            setSpectatingName(displayPlayer.name);
        } else {
            setSpectatingName(null);
        }

        let camX = 0, camY = 0;
        
        // Input is always relative to MY player, even if spectating (though inputs don't do much if dead)
        if (myPlayer) {
            const tempCamX = myPlayer.pos.x - canvas.width / 2;
            const tempCamY = myPlayer.pos.y - canvas.height / 2;
            const input: NetInput = {
                keys: Array.from(keys.current),
                mouse: mouse.current,
                camX: tempCamX,
                camY: tempCamY,
                width: canvas.width, height: canvas.height
            };

            if (isHost) {
                engine.update(dt, input); 
                const state = engine.getState();
                connectionsRef.current.forEach(conn => {
                   if(conn.open) conn.send({ type: 'UPDATE', state });
                });
            } else {
                if (connectionsRef.current[0] && connectionsRef.current[0].open) {
                    connectionsRef.current[0].send({ type: 'INPUT', input });
                }
            }
        }
            
        // HUD Updates based on DISPLAY player (Spectated or Self)
        if (displayPlayer) {
            camX = displayPlayer.pos.x - canvas.width / 2;
            camY = displayPlayer.pos.y - canvas.height / 2;

            setHp(Math.floor(displayPlayer.hp));
            setCurrentWeapon(displayPlayer.weapon);
            setSelectedGrenade(displayPlayer.selectedGrenade);
            setGrenadeCounts({ ...displayPlayer.grenades });
            setGrenadeCooldowns({ ...displayPlayer.grenadeCooldowns });
            setWeaponState({ ...displayPlayer.weaponStates[displayPlayer.weapon] });
            // Only flash if it's ME, otherwise spectator doesn't get flashed by proxy? 
            // Or maybe they do? Let's say yes for immersion.
            setFlashAlpha(displayPlayer.flashIntensity);
        }

        if (myPlayer) {
            setRespawnTimer(myPlayer.isDead ? myPlayer.respawnTimer : 0);
        }
        setTeamScores({ ...engine.teamScores });

        const shake = engine.screenshake;
        const shakeX = (Math.random() - 0.5) * shake;
        const shakeY = (Math.random() - 0.5) * shake;

        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(-camX + shakeX, -camY + shakeY);

        // Render Map
        const map = engine.mapData;
        const startCol = Math.floor(camX / TILE_SIZE);
        const endCol = startCol + (canvas.width / TILE_SIZE) + 1;
        const startRow = Math.floor(camY / TILE_SIZE);
        const endRow = startRow + (canvas.height / TILE_SIZE) + 1;
        for (let y = startRow; y <= endRow; y++) {
            for (let x = startCol; x <= endCol; x++) {
                if (y >= 0 && y < map.height && x >= 0 && x < map.width) {
                    if (map.grid[y][x] === 1) {
                        ctx.fillStyle = '#000000'; // Black walls
                        ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                    } else {
                        // Floor (Dark)
                        ctx.fillStyle = '#1e293b'; // slate-800
                        ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                        ctx.strokeStyle = '#334155'; // slate-700
                        ctx.lineWidth = 1;
                        ctx.strokeRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                    }
                }
            }
        }

        // Fire Zones
        for (const f of engine.fireZones) {
             ctx.beginPath();
             ctx.arc(f.pos.x, f.pos.y, f.radius, 0, Math.PI*2);
             ctx.fillStyle = 'rgba(234, 88, 12, 0.3)';
             ctx.fill();
        }

        // Particles
        ctx.globalCompositeOperation = 'lighter';
        for (const p of engine.particles) {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.alpha;
            ctx.beginPath();
            ctx.arc(p.pos.x, p.pos.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-over';

        // Grenades
        for (const g of engine.grenades) {
            ctx.fillStyle = GRENADES[g.type].color;
            ctx.beginPath();
            ctx.arc(g.pos.x, g.pos.y, 4, 0, Math.PI*2);
            ctx.fill();
        }

        // Bullets
        for (const p of engine.projectiles) {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.pos.x, p.pos.y, p.radius, 0, Math.PI * 2);
            ctx.fill();
        }

        // Explosions
        for (const e of engine.explosions) {
            ctx.beginPath();
            ctx.arc(e.pos.x, e.pos.y, e.maxRadius * (1 - e.life/20), 0, Math.PI*2);
            ctx.fillStyle = e.type === GrenadeType.FLASH ? 'rgba(255,255,255,0.8)' : 'rgba(255,100,0,0.5)';
            ctx.fill();
        }

        // Players
        for (const p of engine.players) {
            if (p.isDead) continue;
            ctx.save();
            ctx.translate(p.pos.x, p.pos.y);
            ctx.rotate(p.rotation);
            ctx.fillStyle = p.color; // Team Color
            ctx.beginPath();
            ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
            ctx.fill();
            if (p.weapon === WeaponType.AWP) {
                ctx.fillStyle = '#000';
                ctx.fillRect(10, -3, 35, 6);
            } else {
                ctx.fillStyle = '#8b5cf6';
                ctx.fillRect(10, -2, 20, 4);
            }
            ctx.restore();
            // HP Bar
            ctx.fillStyle = 'red';
            ctx.fillRect(p.pos.x - 15, p.pos.y - 25, 30, 3);
            ctx.fillStyle = '#22c55e';
            ctx.fillRect(p.pos.x - 15, p.pos.y - 25, 30 * (p.hp / MAX_HP), 3);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(p.name, p.pos.x, p.pos.y - 30);
        }

        // Fog - Uses displayPlayer
        if (displayPlayer) {
            ctx.restore(); 
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, canvas.width, canvas.height);
            const rays = 360; 
            const startHit = castRay(displayPlayer.pos.x, displayPlayer.pos.y, 0, VIEW_RADIUS, map.grid);
            ctx.moveTo(startHit.x - camX + shakeX, startHit.y - camY + shakeY);
            for (let i = 1; i <= rays; i++) {
                const angle = (i / rays) * Math.PI * 2;
                const hit = castRay(displayPlayer.pos.x, displayPlayer.pos.y, angle, VIEW_RADIUS, map.grid);
                ctx.lineTo(hit.x - camX + shakeX, hit.y - camY + shakeY);
            }
            ctx.closePath();
            ctx.fillStyle = 'rgba(0, 0, 0, 1.0)';
            ctx.fill('evenodd');
            ctx.restore();
        } else {
             ctx.restore();
        }
        
        requestRef.current = requestAnimationFrame(loop);
    };
    requestRef.current = requestAnimationFrame(loop);
    return () => { if (requestRef.current) cancelAnimationFrame(requestRef.current); };
  }, []);

  return (
    <div className="relative w-full h-screen bg-slate-900 overflow-hidden flex items-center justify-center">
        <canvas ref={canvasRef} width={window.innerWidth} height={window.innerHeight} className="cursor-crosshair focus:outline-none" tabIndex={0} />
        <div className="flashbang-overlay pointer-events-none" style={{ opacity: flashAlpha, transition: 'opacity 0.1s linear' }} />
        <button onClick={onExit} className="absolute top-4 right-4 bg-red-600 hover:bg-red-500 text-white font-bold py-1 px-3 rounded shadow-lg text-sm z-50 pointer-events-auto">EXIT</button>
        {spectatingName && (
             <div className="absolute top-20 left-1/2 -translate-x-1/2 pointer-events-none z-40 bg-black/50 px-4 py-1 rounded text-yellow-400 font-bold tracking-widest border border-yellow-500/30">
                 SPECTATING: {spectatingName}
             </div>
        )}
        {respawnTimer > 0 && config.gameMode === GameMode.DEATHMATCH && (
             <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
                 <div className="text-center">
                     <h2 className="text-4xl font-black text-red-500 animate-pulse tracking-widest drop-shadow-lg">YOU DIED</h2>
                     <p className="text-xl text-white font-mono mt-2">RESPAWNING IN {(respawnTimer/1000).toFixed(1)}s</p>
                 </div>
             </div>
        )}
        {respawnTimer > 0 && config.gameMode === GameMode.ELIMINATION && !spectatingName && (
             <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-40">
                 <h2 className="text-4xl font-black text-red-500 tracking-widest drop-shadow-lg">ELIMINATED</h2>
             </div>
        )}

        {/* TEAM SCORE BOARD */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-4 pointer-events-none z-30">
            <div className="bg-blue-600 text-white font-black text-2xl px-6 py-2 rounded-b-xl shadow-lg border border-blue-400">
                {teamScores[Team.BLUE]}
            </div>
            <div className="bg-slate-800 text-white font-bold text-sm px-2 py-1 rounded-b flex flex-col items-center">
                <span>{config.gameMode === GameMode.ELIMINATION ? 'ROUNDS' : 'KILLS'}</span>
                {config.gameMode === GameMode.ELIMINATION && <span className="text-[10px] text-slate-400">First to {config.roundsToWin}</span>}
            </div>
            <div className="bg-red-600 text-white font-black text-2xl px-6 py-2 rounded-b-xl shadow-lg border border-red-400">
                {teamScores[Team.RED]}
            </div>
        </div>

        {/* HUD */}
        <div className="absolute top-4 left-4 flex flex-col gap-1 pointer-events-none">
            <div className="bg-slate-800/90 p-2 rounded border border-slate-600 shadow-xl backdrop-blur-sm w-44">
                <div className="flex justify-between items-center mb-1"><span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Health</span></div>
                <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-700">
                    <div className="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-300" style={{ width: `${hp}%` }} />
                </div>
                <div className="mt-1 flex justify-between"><span className="text-white font-mono text-sm">{hp}</span></div>
            </div>
            <div className="bg-slate-800/90 p-2 rounded border border-slate-600 shadow-xl backdrop-blur-sm w-44">
                 <div className="flex justify-between items-center mb-1">
                    <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Loadout</div>
                    {weaponState.isReloading && <span className="text-[10px] text-yellow-400 animate-pulse font-bold">RELOAD</span>}
                 </div>
                 <div className="flex gap-1 mb-2">
                     <div className={`flex-1 p-1 rounded border flex flex-col items-center justify-center ${currentWeapon === WeaponType.MAGIC_WAND ? 'bg-purple-900/50 border-purple-400' : 'bg-slate-700/50 border-slate-600'}`}>
                         <div className="text-[9px] font-bold text-white">[1] Wand</div>
                         {currentWeapon === WeaponType.MAGIC_WAND && <span className="text-xs font-mono text-purple-200 mt-1">{weaponState.currentAmmo}</span>}
                     </div>
                     <div className={`flex-1 p-1 rounded border flex flex-col items-center justify-center ${currentWeapon === WeaponType.AWP ? 'bg-amber-900/50 border-amber-400' : 'bg-slate-700/50 border-slate-600'}`}>
                         <div className="text-[9px] font-bold text-white">[2] AWP</div>
                         {currentWeapon === WeaponType.AWP && <span className="text-xs font-mono text-amber-200 mt-1">{weaponState.currentAmmo}</span>}
                     </div>
                 </div>
                 <div className="flex gap-1">
                    {[GrenadeType.HE, GrenadeType.FLASH, GrenadeType.MOLOTOV].map((g, i) => (
                        <div key={g} className={`relative p-1 rounded border flex flex-col items-center flex-1 ${selectedGrenade === g ? 'bg-blue-900/50 border-blue-400' : 'bg-slate-700/50 border-slate-600'}`}>
                            <div className="text-[9px] font-bold text-white">[{i+3}] {g.substr(0, 1)}</div>
                            <div className="text-[10px] text-slate-300">x{grenadeCounts[g] || 0}</div>
                        </div>
                    ))}
                 </div>
            </div>
        </div>
        
        {/* KILL FEED */}
        <div className="absolute top-20 right-4 flex flex-col gap-1 items-end pointer-events-none">
            {killFeed.map((k, i) => (
                <div key={i} className="bg-slate-900/80 text-white text-xs px-2 py-1 rounded border border-slate-700 flex items-center gap-2 animate-in fade-in slide-in-from-right-5 duration-300">
                    <span className="font-bold text-blue-400">{k.killer}</span>
                    {k.assister && <span className="text-[10px] text-slate-400">+ {k.assister}</span>}
                    <div className="mx-1 opacity-80 scale-75">
                        {getWeaponIcon(k.weapon)}
                    </div>
                    <span className="font-bold text-red-400">{k.victim}</span>
                </div>
            ))}
        </div>
    </div>
  );
};
export default GameCanvas;
