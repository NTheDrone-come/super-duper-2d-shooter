
import React, { useState, useEffect, useRef } from 'react';
import { generateMap } from '../services/geminiService';
import { GameMode, GameConfig } from '../types';

declare const Peer: any;

interface MainMenuProps {
  onStart: (playerName: string, mapGrid: number[][], isHost: boolean, peer: any, connections: any[], config: GameConfig) => void;
  initialPeer?: any;
  initialConnections?: any[];
  initialName?: string;
  initialView?: 'HOME' | 'LOBBY_HOST' | 'LOBBY_JOIN';
}

const MainMenu: React.FC<MainMenuProps> = ({ onStart, initialPeer, initialConnections, initialName, initialView }) => {
  const [view, setView] = useState<'HOME' | 'LOBBY_HOST' | 'LOBBY_JOIN'>(initialView || 'HOME');
  const [name, setName] = useState(initialName || 'Player' + Math.floor(Math.random()*1000));
  
  // Host State
  const [myPeerId, setMyPeerId] = useState('');
  const [connectedPlayers, setConnectedPlayers] = useState<string[]>([]);
  const [genLoading, setGenLoading] = useState(false);
  const [genStatus, setGenStatus] = useState('');
  
  // Game Configuration
  const [enableBots, setEnableBots] = useState(true);
  const [selectedMode, setSelectedMode] = useState<GameMode>(GameMode.DEATHMATCH);
  const [selectedMap, setSelectedMap] = useState<string>('ARENA');
  
  // Advanced Settings
  const [isTeamDeathmatch, setIsTeamDeathmatch] = useState(true);
  const [allyCount, setAllyCount] = useState(0); // For single player mainly
  const [enemyCount, setEnemyCount] = useState(3);
  const [roundsToWin, setRoundsToWin] = useState(5);

  // Client State
  const [joinId, setJoinId] = useState('');
  const [clientStatus, setClientStatus] = useState('');
  
  const peerRef = useRef<any>(initialPeer || null);
  const connectionsRef = useRef<any[]>(initialConnections || []); 
  const hostConnRef = useRef<any>(initialConnections && initialConnections[0] ? initialConnections[0] : null);

  useEffect(() => {
    if (initialPeer) {
        setMyPeerId(initialPeer.id);
        if (initialView === 'LOBBY_HOST') {
            const players = initialConnections?.map(c => 'Player ' + c.peer.substr(0,4)) || [];
            setConnectedPlayers(players);
            initialPeer.off('connection');
            initialPeer.on('connection', (conn: any) => {
                connectionsRef.current.push(conn);
                setConnectedPlayers(prev => [...prev, 'Player ' + conn.peer.substr(0,4)]);
                conn.on('close', () => {
                     connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
                     setConnectedPlayers(prev => prev.filter(p => !p.includes(conn.peer.substr(0,4))));
                });
            });
        }
        if (initialView === 'LOBBY_JOIN') {
            if (hostConnRef.current) {
                setClientStatus('Connected! Waiting for Host...');
                hostConnRef.current.off('data');
                hostConnRef.current.on('data', (data: any) => {
                    if (data.type === 'START_GAME') {
                        setClientStatus('Starting...');
                        onStart(name, data.mapGrid, false, peerRef.current, [hostConnRef.current], data.config);
                    }
                });
            }
        }
    }
  }, []);

  const initPeer = () => {
    if (peerRef.current) return peerRef.current;
    const peer = new Peer();
    peerRef.current = peer;
    peer.on('open', (id: string) => setMyPeerId(id));
    peer.on('error', (err: any) => setClientStatus('Connection Error: ' + err.type));
    return peer;
  };

  const getConfig = (): GameConfig => ({
      botsEnabled: enableBots,
      gameMode: selectedMode,
      allyCount: allyCount,
      enemyCount: enemyCount,
      isTeamDeathmatch: isTeamDeathmatch,
      roundsToWin: roundsToWin
  });

  const handleSoloPlay = async () => {
      setGenLoading(true);
      setGenStatus('Generating Map...');
      const grid = await generateMap(selectedMap);
      onStart(name, grid, true, null, [], getConfig());
  };

  const handleCreateLobby = () => {
    setView('LOBBY_HOST');
    const peer = initPeer();
    peer.off('connection');
    peer.on('connection', (conn: any) => {
      connectionsRef.current.push(conn);
      setConnectedPlayers(prev => [...prev, 'Player ' + conn.peer.substr(0,4)]); 
      conn.on('close', () => {
         connectionsRef.current = connectionsRef.current.filter(c => c !== conn);
         setConnectedPlayers(prev => prev.filter(p => !p.includes(conn.peer.substr(0,4))));
      });
    });
  };

  const handleStartMatch = async () => {
    setGenLoading(true);
    setGenStatus('Generating Map...');
    try {
        const grid = await generateMap(selectedMap);
        setGenStatus('Starting...');
        const config = getConfig();
        connectionsRef.current.forEach(conn => {
            conn.send({ type: 'START_GAME', mapGrid: grid, hostName: name, config });
        });
        setTimeout(() => {
            onStart(name, grid, true, peerRef.current, connectionsRef.current, config);
        }, 500);
    } catch (e) {
        setGenStatus('Error generating map');
        setGenLoading(false);
    }
  };

  const handleJoinLobby = () => {
      if (!joinId) return;
      setView('LOBBY_JOIN');
      setClientStatus('Connecting...');
      const peer = initPeer();
      peer.on('open', () => {
          const conn = peer.connect(joinId);
          hostConnRef.current = conn;
          conn.on('open', () => {
              setClientStatus('Connected! Waiting for Host...');
              conn.send({ type: 'HELLO', name: name });
          });
          conn.on('data', (data: any) => {
              if (data.type === 'START_GAME') {
                  setClientStatus('Starting...');
                  onStart(name, data.mapGrid, false, peerRef.current, [conn], data.config);
              }
          });
          conn.on('close', () => setClientStatus('Disconnected from Host'));
      });
  };

  const renderConfigSection = () => (
      <div className="space-y-4 bg-slate-900/40 p-3 rounded-lg border border-slate-700/50">
          <div className="grid grid-cols-2 gap-2">
            <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">MODE</label>
                <select value={selectedMode} onChange={e => setSelectedMode(e.target.value as GameMode)} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs">
                    <option value={GameMode.DEATHMATCH}>Deathmatch</option>
                    <option value={GameMode.ELIMINATION}>Elimination (Rounds)</option>
                </select>
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-400 mb-1">MAP</label>
                <select value={selectedMap} onChange={e => setSelectedMap(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-xs">
                    <option value="ARENA">The Arena</option>
                    <option value="BRIDGE">The Bridge</option>
                    <option value="BUNKER">The Bunker</option>
                    <option value="simple">Random Caves</option>
                    <option value="complex">AI Generated</option>
                </select>
            </div>
          </div>

          {selectedMode === GameMode.DEATHMATCH && (
               <div>
                   <label className="block text-xs font-bold text-slate-400 mb-1">TYPE</label>
                   <div className="flex bg-slate-800 rounded p-1">
                       <button onClick={() => setIsTeamDeathmatch(true)} className={`flex-1 text-xs py-1 rounded ${isTeamDeathmatch ? 'bg-blue-600 text-white shadow' : 'text-slate-400'}`}>TEAMS</button>
                       <button onClick={() => setIsTeamDeathmatch(false)} className={`flex-1 text-xs py-1 rounded ${!isTeamDeathmatch ? 'bg-red-600 text-white shadow' : 'text-slate-400'}`}>FREE FOR ALL</button>
                   </div>
               </div>
          )}

          {selectedMode === GameMode.ELIMINATION && (
               <div className="space-y-2">
                   <div>
                       <div className="flex justify-between text-xs font-bold text-slate-400 mb-1"><span>ROUNDS TO WIN</span> <span>{roundsToWin}</span></div>
                       <input type="range" min="2" max="20" value={roundsToWin} onChange={e => setRoundsToWin(Number(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
                   </div>
                   <div>
                       <div className="flex justify-between text-xs font-bold text-slate-400 mb-1"><span>ALLIES (BOTS)</span> <span>{allyCount}</span></div>
                       <input type="range" min="0" max="4" value={allyCount} onChange={e => setAllyCount(Number(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
                   </div>
                   <div>
                       <div className="flex justify-between text-xs font-bold text-slate-400 mb-1"><span>ENEMIES (BOTS)</span> <span>{enemyCount}</span></div>
                       <input type="range" min="1" max="4" value={enemyCount} onChange={e => setEnemyCount(Number(e.target.value))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer" />
                   </div>
               </div>
          )}
      </div>
  );

  return (
    <div className="w-full h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-4 relative overflow-hidden">
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
          <div className="absolute top-0 left-0 w-64 h-64 bg-purple-600 rounded-full blur-[100px] animate-pulse"></div>
          <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-600 rounded-full blur-[120px] animate-pulse"></div>
      </div>

      <div className="z-10 w-full max-w-md bg-slate-800/50 backdrop-blur-xl p-8 rounded-2xl border border-slate-700 shadow-2xl">
        <h1 className="text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-blue-400 mb-2 text-center">ARCANE AWP</h1>
        <p className="text-slate-400 text-center mb-6">Tactical Magic Shooter</p>

        {view === 'HOME' && (
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Operative Name</label>
                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white outline-none focus:ring-2 focus:ring-purple-500" />
                </div>
                
                {renderConfigSection()}

                <div className="flex flex-col gap-3">
                    <button onClick={handleSoloPlay} disabled={genLoading} className="w-full bg-slate-700 hover:bg-slate-600 py-3 rounded-lg font-bold border border-slate-600">Single Player</button>
                    <button onClick={handleCreateLobby} className="w-full bg-purple-600 hover:bg-purple-500 py-3 rounded-lg font-bold shadow-lg shadow-purple-900/50">Create Lobby (Host)</button>
                    <div className="flex gap-2">
                         <input type="text" placeholder="Enter Host ID..." value={joinId} onChange={e => setJoinId(e.target.value)} className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 text-white font-mono text-sm" />
                         <button onClick={handleJoinLobby} className="bg-blue-600 hover:bg-blue-500 px-6 rounded-lg font-bold">Join</button>
                    </div>
                </div>
                {genLoading && <div className="text-center text-yellow-400 text-sm animate-pulse">{genStatus}</div>}
            </div>
        )}

        {view === 'LOBBY_HOST' && (
            <div className="space-y-4">
                <div className="bg-black/40 p-3 rounded border border-slate-600">
                    <div className="text-xs text-slate-400 uppercase font-bold">Lobby ID</div>
                    <div className="text-xl font-mono text-yellow-400 select-all cursor-pointer">{myPeerId || 'Initializing...'}</div>
                </div>
                <div className="flex items-center gap-2">
                    <input type="checkbox" id="bots" checked={enableBots} onChange={e => setEnableBots(e.target.checked)} className="w-4 h-4 accent-purple-500" />
                    <label htmlFor="bots" className="text-sm text-white font-bold cursor-pointer">Enable Bot Spawning (Fill Slots)</label>
                </div>
                
                {renderConfigSection()}

                <div className="bg-slate-900/50 p-3 rounded h-32 overflow-y-auto">
                    <div className="text-xs text-slate-400 uppercase font-bold mb-2">Players</div>
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-sm text-green-400 font-bold"><div className="w-2 h-2 bg-green-500 rounded-full"></div> {name} (You)</div>
                        {connectedPlayers.map((p, i) => (
                             <div key={i} className="flex items-center gap-2 text-sm text-white"><div className="w-2 h-2 bg-blue-500 rounded-full"></div> {p}</div>
                        ))}
                    </div>
                </div>
                <button onClick={handleStartMatch} disabled={genLoading} className="w-full bg-green-600 hover:bg-green-500 py-3 rounded font-bold shadow-lg mt-4">START MATCH</button>
                {genLoading && <div className="text-center text-yellow-400 text-sm animate-pulse">{genStatus}</div>}
            </div>
        )}

        {view === 'LOBBY_JOIN' && (
             <div className="text-center py-8">
                 <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                 <h2 className="text-xl font-bold text-white mb-2">Lobby Connected</h2>
                 <p className="text-slate-400 font-mono text-sm">{clientStatus}</p>
             </div>
        )}
      </div>
    </div>
  );
};

export default MainMenu;
