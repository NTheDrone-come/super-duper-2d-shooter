
import React, { useState, useRef } from 'react';
import MainMenu from './components/MainMenu';
import GameCanvas from './components/GameCanvas';
import { GameState, GameConfig, GameMode } from './types';

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [playerName, setPlayerName] = useState('Player');
  const [mapGrid, setMapGrid] = useState<number[][]>([]);
  const [gameOverMessage, setGameOverMessage] = useState('');
  
  // Game Config
  const [gameConfig, setGameConfig] = useState<GameConfig>({
      botsEnabled: true,
      gameMode: GameMode.DEATHMATCH,
      allyCount: 0,
      enemyCount: 3,
      isTeamDeathmatch: true,
      roundsToWin: 5
  });
  
  // Network Persistance
  const [isHost, setIsHost] = useState(true);
  const peerRef = useRef<any>(null);
  const connectionsRef = useRef<any[]>([]);

  const handleStartGame = (name: string, grid: number[][], host: boolean, peer: any, connections: any[], config: GameConfig) => {
    setPlayerName(name);
    setMapGrid(grid);
    setIsHost(host);
    setGameConfig(config);
    
    // Store network state
    peerRef.current = peer;
    connectionsRef.current = connections;

    setGameState(GameState.PLAYING);
  };

  const handleGameOver = (winner: string) => {
    setGameOverMessage(`${winner} Wins!`);
    setGameState(GameState.GAME_OVER);
  };

  const handleBackToLobby = () => {
      setGameState(GameState.MENU);
  };

  return (
    <>
      {gameState === GameState.MENU && (
        <MainMenu 
            onStart={handleStartGame} 
            initialPeer={peerRef.current}
            initialConnections={connectionsRef.current}
            initialName={playerName}
            initialView={peerRef.current ? (isHost ? 'LOBBY_HOST' : 'LOBBY_JOIN') : 'HOME'}
        />
      )}

      {gameState === GameState.PLAYING && (
        <GameCanvas 
            mapGrid={mapGrid} 
            playerName={playerName} 
            onGameOver={handleGameOver}
            isHost={isHost}
            peerInstance={peerRef.current}
            initialConnections={connectionsRef.current}
            config={gameConfig}
            onExit={handleBackToLobby}
        />
      )}

      {gameState === GameState.GAME_OVER && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-50 backdrop-blur-sm">
            <h2 className="text-5xl font-black text-white mb-4 tracking-tighter drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]">GAME OVER</h2>
            <p className="text-2xl text-purple-400 mb-8">{gameOverMessage}</p>
            <button 
                onClick={handleBackToLobby}
                className="bg-white text-black font-bold py-3 px-8 rounded-full hover:bg-purple-400 hover:scale-105 transition-all shadow-[0_0_20px_rgba(255,255,255,0.3)]"
            >
                Return to Lobby
            </button>
        </div>
      )}
    </>
  );
};

export default App;
