
import { GoogleGenAI, Type } from "@google/genai";
import { MAP_WIDTH, MAP_HEIGHT } from '../constants';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Flood fill to remove isolated pockets
const pruneIsolatedAreas = (grid: number[][]): number[][] => {
  const height = grid.length;
  const width = grid[0].length;
  const visited = Array.from({ length: height }, () => Array(width).fill(false));
  const regions: { x: number, y: number }[][] = [];

  // 1. Identify all regions
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (grid[y][x] === 0 && !visited[y][x]) {
        const region: { x: number, y: number }[] = [];
        const queue: { x: number, y: number }[] = [{ x, y }];
        visited[y][x] = true;

        while (queue.length > 0) {
          const curr = queue.shift()!;
          region.push(curr);

          const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
          for (const [dx, dy] of dirs) {
            const nx = curr.x + dx;
            const ny = curr.y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height && grid[ny][nx] === 0 && !visited[ny][nx]) {
              visited[ny][nx] = true;
              queue.push({ x: nx, y: ny });
            }
          }
        }
        regions.push(region);
      }
    }
  }

  // 2. Find largest region
  if (regions.length === 0) return grid; // Should not happen
  regions.sort((a, b) => b.length - a.length);
  
  // 3. Fill all other regions
  const newGrid = grid.map(row => [...row]);
  for (let i = 1; i < regions.length; i++) {
    for (const cell of regions[i]) {
      newGrid[cell.y][cell.x] = 1;
    }
  }

  return newGrid;
};

// --- STATIC MAPS ---

// Map 1: The Arena (From User Photo - Left Blue, Right Red, Middle Obstacles)
const getArenaMap = (): number[][] => {
    let grid: number[][] = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
        let row: number[] = [];
        for (let x = 0; x < MAP_WIDTH; x++) {
            if (x === 0 || x === MAP_WIDTH - 1 || y === 0 || y === MAP_HEIGHT - 1) {
                row.push(1); // Border
            } 
            // Middle Obstacles (Vertical bars and center block)
            else if (x > 18 && x < 22 && y > 10 && y < 15) { row.push(1); } // Center block
            else if (x === 10 && y > 5 && y < 20 && y % 5 !== 0) { row.push(1); } // Left bar with gaps
            else if (x === 30 && y > 5 && y < 20 && y % 5 !== 0) { row.push(1); } // Right bar with gaps
            else if (y === 12 && (x < 5 || x > 35)) { row.push(1); } // Spawn protection walls
            else { row.push(0); }
        }
        grid.push(row);
    }
    return grid;
};

// Map 2: The Bridge (Two islands)
const getBridgeMap = (): number[][] => {
    let grid: number[][] = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
        let row: number[] = [];
        for (let x = 0; x < MAP_WIDTH; x++) {
            if (x === 0 || x === MAP_WIDTH - 1 || y === 0 || y === MAP_HEIGHT - 1) {
                row.push(1);
            } else {
                // The Void (Walls) in the middle columns, except bridge
                if (x > 15 && x < 25) {
                    if (y > 10 && y < 14) row.push(0); // Bridge
                    else row.push(1); // Void
                } else {
                    // Random covers on islands
                    row.push(Math.random() < 0.1 ? 1 : 0);
                }
            }
        }
        grid.push(row);
    }
    return pruneIsolatedAreas(grid);
};

// Map 3: The Bunker (Close Quarters)
const getBunkerMap = (): number[][] => {
    let grid: number[][] = [];
    for (let y = 0; y < MAP_HEIGHT; y++) {
        let row: number[] = [];
        for (let x = 0; x < MAP_WIDTH; x++) {
            if (x === 0 || x === MAP_WIDTH - 1 || y === 0 || y === MAP_HEIGHT - 1) {
                row.push(1);
            } else if (x % 6 === 0 || y % 6 === 0) {
                 // Grid pattern walls with frequent doors
                 if ((x+y) % 3 === 0) row.push(0);
                 else row.push(1);
            } else {
                row.push(0);
            }
        }
        grid.push(row);
    }
    return pruneIsolatedAreas(grid);
};

// Local random generator
export const generateLocalMap = (): number[][] => {
  let grid: number[][] = [];
  for (let y = 0; y < MAP_HEIGHT; y++) {
    const row: number[] = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (x === 0 || x === MAP_WIDTH - 1 || y === 0 || y === MAP_HEIGHT - 1) {
        row.push(1);
      } else {
        row.push(Math.random() < 0.4 ? 1 : 0);
      }
    }
    grid.push(row);
  }

  for (let i = 0; i < 5; i++) {
    const newGrid = JSON.parse(JSON.stringify(grid));
    for (let y = 1; y < MAP_HEIGHT - 1; y++) {
      for (let x = 1; x < MAP_WIDTH - 1; x++) {
        let walls = 0;
        for (let ny = y - 1; ny <= y + 1; ny++) {
          for (let nx = x - 1; nx <= x + 1; nx++) {
            if (ny === y && nx === x) continue;
            if (grid[ny][nx] === 1) walls++;
          }
        }
        if (walls > 4) newGrid[y][x] = 1;
        else if (walls < 4) newGrid[y][x] = 0;
      }
    }
    grid = newGrid;
  }
  return pruneIsolatedAreas(grid);
};

export const generateMap = async (type: string): Promise<number[][]> => {
  
  if (type === 'ARENA') return getArenaMap();
  if (type === 'BRIDGE') return getBridgeMap();
  if (type === 'BUNKER') return getBunkerMap();
  if (type === 'simple') return generateLocalMap();

  // 'complex' uses AI
  const modelName = 'gemini-2.5-flash';
  const prompt = `
    Generate a 2D top-down shooter map layout as a JSON 2D array.
    Dimensions: ${MAP_WIDTH} width x ${MAP_HEIGHT} height.
    Use 0 for empty walkable space.
    Use 1 for solid walls.
    Ensure there are open areas for combat and some walls for cover.
    The map must be fully enclosed by walls (1) on the borders.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            grid: {
              type: Type.ARRAY,
              items: { type: Type.ARRAY, items: { type: Type.INTEGER } }
            }
          }
        }
      }
    });

    const json = JSON.parse(response.text);
    let grid = json.grid;
    if (!grid || !Array.isArray(grid) || grid.length !== MAP_HEIGHT || grid[0].length !== MAP_WIDTH) {
       return generateLocalMap();
    }
    return pruneIsolatedAreas(grid);

  } catch (error) {
    console.error("Gemini Map Gen Error:", error);
    return generateLocalMap();
  }
};
