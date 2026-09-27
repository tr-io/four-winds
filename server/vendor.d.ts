declare module '@kobalab/majiang-core' {
  const Majiang: {
    rule: (param?: Record<string, unknown>) => Record<string, unknown>;
    Game: {
      get_gang_mianzi: (
        rule: unknown,
        hand: MajiangHand,
        p: string | null,
        remaining: number,
        kongs: number,
      ) => string[];
    };
    Shoupai: { fromString: (text: string) => MajiangHand };
    Util: {
      hule: (
        hand: MajiangHand,
        ron: string | null,
        params: unknown,
      ) =>
        | {
            hupai?: { name: string; fanshu: number | string; baojia?: number }[];
            fu: number;
            fanshu: number;
            damanguan?: number;
            defen: number;
            fenpei: number[];
          }
        | undefined;
      hule_param: (params: Record<string, unknown>) => unknown;
      xiangting: (hand: MajiangHand) => number;
      tingpai: (hand: MajiangHand) => string[];
      hule_mianzi: (hand: MajiangHand, ron: string | null) => string[][];
    };
  };
  interface MajiangHand {
    zimo(tile: string, check?: boolean): MajiangHand;
    get_gang_mianzi(): string[];
    _fulou: string[];
    _zimo: string | null;
    _lizhi: boolean;
  }
  export default Majiang;
}
