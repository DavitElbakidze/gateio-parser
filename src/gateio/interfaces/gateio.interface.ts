export interface GateioTickerResponse {
    currency_pair: string;
    highest_bid: string;
    lowest_ask: string;
  }
  
  export interface ProcessedRate {
    from: string;
    to: string;
    buy: string;
    sell: string;
  }
  
  export interface GateioConfig {
    wsUrl: string;
    emitter?: any;
    callback?: (event: string, key: string, data: ProcessedRate) => void;
  }