export type Preset = 'mcr' | 'riichi' | 'singapore';
export type Tile = number; // Physical IDs: 4 copies of kinds 0..33, bonuses 136..147.
export type ClaimKind = 'win' | 'pung' | 'kong' | 'chow';
export type Rules = {
  id: string;
  name: string;
  preset: Preset;
  rounds: number;
  claimSeconds: number;
  turnSeconds: number;
  nextHandSeconds: number;
  advanceWhenReady: boolean;
  hostCanAdvance: boolean;
  allowChow: boolean;
  allowKong: boolean;
  sevenPairs: boolean;
  minimum: number;
  points: boolean;
  chips: boolean;
  startingPoints: number;
  startingChips: number;
  chipsPerPoint: number;
  scoreMultiplier: number;
  meldPriority: 'pung-first' | 'equal' | 'chow-first';
  dealerRepeats: boolean;
  openTanyao: boolean;
  kiriage: boolean;
  uraDora: boolean;
  taiCap: number;
  sgAnimals: boolean;
  sgFlowers: boolean;
  sgInstantBonuses: boolean;
  sgBonusUnit: number;
  sgBase: number;
  sgSelfDraw: number;
  houseBonuses: {
    name: string;
    condition: 'self-draw' | 'closed' | 'all-pungs' | 'full-flush';
    points: number;
  }[];
};
export type Profile = { id: string; name: string; avatar: string; hands: number; wins: number };
export type Meld = {
  kind: 'chow' | 'pung' | 'kong';
  tiles: Tile[];
  from: number;
  concealed: boolean;
  added?: boolean;
};
export type Discard = { tile: Tile; claimed: boolean; riichi: boolean };
export type Player = {
  profile: Profile;
  bot: boolean;
  connected: boolean;
  ready: boolean;
  hand: Tile[];
  melds: Meld[];
  bonuses: Tile[];
  discards: Discard[];
  points: number;
  chips: number;
  riichi: number;
  ippatsu: boolean;
  temporaryFuriten: boolean;
  riichiFuriten: boolean;
  drawn: Tile | null;
  drawSource: 'wall' | 'kong' | 'bonus';
  hasDiscarded: boolean;
  hasDrawn: boolean;
  missedWins: number[];
  missedPungs: number[];
};
export type LegalAction = {
  id: string;
  kind: ClaimKind | 'pass' | 'discard' | 'riichi' | 'concealed-kong' | 'added-kong';
  tiles: Tile[];
  label: string;
};
export type ClaimResponse = { seat: number; action: LegalAction; order: number };
export type ClaimWindow = {
  id: number;
  from: number;
  tile: Tile;
  deadline: number;
  options: Record<number, LegalAction[]>;
  responses: ClaimResponse[];
  reason: 'discard' | 'added-kong' | 'concealed-kong';
  kongTiles?: Tile[];
};
export type Score = {
  unit: 'fan' | 'han' | 'tai';
  value: number;
  fu?: number;
  patterns: { name: string; value: number }[];
  payments: number[];
};
export type WinningRoute = {
  name: string;
  hand: Tile[];
  needed: Tile[];
  discard: Tile[];
  groups: { kind: 'chow' | 'pung' | 'pair' | 'special'; tiles: Tile[] }[];
  score: Score;
  points: number;
};
export type HandAnalysis = { decision: number; handNumber: number; routes: WinningRoute[] };
export type HandResult = {
  winner: number | null;
  from: number | null;
  reason: string;
  score?: Score;
  deltas: number[];
  hands: Tile[][];
  tenpai?: number[];
  repeat: boolean;
};
export type GameEvent = {
  id: number;
  at: number;
  type: 'info' | 'draw' | 'discard' | 'claim' | 'win' | 'bonus';
  text: string;
  seat?: number;
  tile?: Tile;
};
export type Game = {
  rules: Rules;
  seed: number;
  phase: 'playing' | 'claim' | 'ended' | 'finished';
  players: Player[];
  dealer: number;
  round: number;
  rotation: number;
  handNumber: number;
  turn: number;
  decision: number;
  turnDeadline: number;
  wall: Tile[];
  deadWall: Tile[];
  reserve: number;
  kongCount: number;
  dora: Tile[];
  ura: Tile[];
  honba: number;
  riichiPot: number;
  claim: ClaimWindow | null;
  claimOrder: number;
  lastClaim: { seat: number; kind: string; tile: Tile; at: number } | null;
  result: HandResult | null;
  events: GameEvent[];
  eventId: number;
  interrupted: boolean;
  forbiddenDiscards: number[];
  riichiDeclaring: number | null;
};
export type PublicPlayer = Omit<
  Player,
  'hand' | 'temporaryFuriten' | 'riichiFuriten' | 'missedWins' | 'missedPungs'
> & { hand: Tile[]; tileCount: number };
export type GameView = Omit<
  Game,
  'players' | 'wall' | 'deadWall' | 'seed' | 'claim' | 'ura' | 'forbiddenDiscards'
> & {
  players: PublicPlayer[];
  wallCount: number;
  seat: number;
  actions: LegalAction[];
  winAssessment: {
    qualifying: number;
    minimum: number;
    flowers: number;
    patterns: Score['patterns'];
  } | null;
  claim: {
    id: number;
    from: number;
    tile: Tile;
    deadline: number;
    reason: string;
    responded: number[];
    submitted?: string;
  } | null;
};
export type Lobby = { code: string; name: string; host: string; createdAt: number };
export type LobbyView = Lobby & { members: number; tables: number };
export type Room = {
  lobby: string;
  code: string;
  name: string;
  host: string;
  rules: Rules;
  players: Player[];
  game: Game | null;
  createdAt: number;
};
export type RoomSummary = {
  code: string;
  name: string;
  rulesName: string;
  preset: Preset;
  seats: number;
  humans: number;
  bots: number;
  online: number;
  phase: Game['phase'] | 'waiting';
  playing: boolean;
  names: string[];
};
export type RoomView = {
  code: string;
  name: string;
  host: string;
  rules: Rules;
  players: PublicPlayer[];
  game: GameView | null;
};
export type AppState = {
  lobby: LobbyView;
  lobbies: LobbyView[];
  profile: Profile;
  rulesets: Rules[];
  rooms: RoomSummary[];
  room: RoomView | null;
  serverTime: number;
};
