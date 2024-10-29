import { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as WebSocket from 'ws';
import axios from 'axios';

interface GateioConfig {
  emitter?: boolean;
  callback?: (event: string, key: string, data: any) => void;
}

interface ProcessedRate {
  from: string;
  to: string;
  buy: number;
  sell: number;
}

interface GateioTickerResponse {
  currency_pair: string;
  last: string;
  lowest_ask: string;
  highest_bid: string;
  change_percentage: string;
  base_volume: string;
  quote_volume: string;
  high_24h: string;
  low_24h: string;
}

export class GateioService implements OnModuleInit, OnModuleDestroy {
  private ws: WebSocket;
  private readonly wsUrl = 'wss://api.gateio.ws/ws/v4/';
  private readonly pairsUrl = 'https://data.gateapi.io/api2/1/pairs';
  private reconnectAttempts = 1;
  private pingInterval: NodeJS.Timeout;
  private previousPrices: Map<string, number> = new Map();
  private readonly idKey: string = 'gateio';
  private symbols: string[] = [];
  private ignoreSymbols: string[] = [];

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly config: GateioConfig
  ) {}

  async onModuleInit() {
    try {
      await this.fetchTradingPairs();
      await this.initWebSocket();
    } catch (error) {
      console.error('Failed to initialize:', error);
    }
  }

  private async fetchTradingPairs() {
    try {
      const response = await axios.get(this.pairsUrl);
      if (Array.isArray(response.data)) {
        this.symbols = response.data.map(pair => pair.replace('_', '/')).map(pair => pair.replace('/', '_'));
        console.log(`Fetched ${this.symbols.length} trading pairs`);
      } else {
        throw new Error('Invalid response format from pairs API');
      }
    } catch (error) {
      console.error('Failed to fetch trading pairs:', error);
      this.symbols = ["BTC_USDT", "ETH_USDT", "BNB_USDT"];
      console.log('Using default trading pairs');
    }
  }

  onModuleDestroy() {
    this.cleanup();
  }

  private cleanup() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    if (this.ws) {
      this.ws.close();
    }
  }

  private async initWebSocket() {
    try {
      this.cleanup();
      this.ws = new WebSocket(this.wsUrl);
      this.setupWebSocketHandlers();
    } catch (error) {
      console.error('Failed to initialize WebSocket:', error);
      await this.handleReconnect();
    }
  }

  private setupWebSocketHandlers() {
    this.ws.on('open', () => this.handleOpen());
    this.ws.on('message', (data: WebSocket.RawData) => this.handleMessage(data));
    this.ws.on('error', (error) => this.handleError(error));
    this.ws.on('close', () => this.handleClose());
    this.ws.on('pong', () => this.handlePong());
  }

  private handleOpen() {
    console.log('Connected to Gate.io WebSocket');
    this.reconnectAttempts = 1;
    this.setupPingInterval();
    this.subscribe();
    
    // Print initial table header
    console.log('\nPair           Price                   Change');
    console.log('-'.repeat(50));
  }

  private handleMessage(data: WebSocket.RawData) {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.event === 'subscribe') {
        return;
      }

      if (message.error) {
        console.error('Gate.io error:', message.error?.message);
        return;
      }

      if (message.channel === 'spot.tickers' && message.event === 'update') {
        const result = message.result as GateioTickerResponse;
        if (!result) return;

        const pair = result.currency_pair;
        const currentPrice = parseFloat(result.last);
        
        if (isNaN(currentPrice)) return;

        const previousPrice = this.previousPrices.get(pair) || currentPrice;
        const priceChange = currentPrice - previousPrice;
        this.previousPrices.set(pair, currentPrice);

        // Format price change indicator
        const changeIndicator = priceChange === 0 ? '=' : 
                              priceChange > 0 ? '+' : 
                              '-';

        // Format the output with fixed spacing
        const pairStr = pair.padEnd(15);
        const priceStr = currentPrice.toFixed(8).padEnd(20);
        const changeStr = `${changeIndicator} ${Math.abs(priceChange).toFixed(8)}`;

        // Print the update
        console.log(`${pairStr}${priceStr}${changeStr}`);

        // Emit rate update if configured
        this.emitRates({
          from: pair.split('_')[0],
          to: pair.split('_')[1],
          buy: parseFloat(result.lowest_ask) || currentPrice,
          sell: parseFloat(result.highest_bid) || currentPrice
        });
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  }

  private emitRates(rate: ProcessedRate) {
    if (this.config.emitter) {
      this.eventEmitter.emit('updateRate', this.idKey, rate);
    } else if (this.config.callback) {
      this.config.callback('updateRate', this.idKey, rate);
    }
  }

  private setupPingInterval() {
    this.pingInterval = setInterval(() => {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      } else {
        this.cleanup();
        this.initWebSocket();
      }
    }, 5000);
  }

  private async handleReconnect() {
    this.reconnectAttempts = Math.min(this.reconnectAttempts + 1, 60);
    const delay = this.reconnectAttempts > 4 ? 30000 : 2000;
    
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.initWebSocket();
    }, delay);
  }

  private handleError(error: Error) {
    console.error('WebSocket error:', error);
  }

  private handleClose() {
    console.log('WebSocket closed');
    this.handleReconnect();
  }

  private handlePong() {
    // Connection is alive, no action needed
  }

  private subscribe() {
    const validSymbols = this.symbols.filter(
      symbol => !this.ignoreSymbols.includes(symbol)
    );

    if (validSymbols.length === 0) {
      console.error('No valid symbols to subscribe to.');
      return;
    }

    const subscribeMessage = {
      time: Date.now(),
      channel: 'spot.tickers',
      event: 'subscribe',
      payload: validSymbols,
    };

    this.ws.send(JSON.stringify(subscribeMessage));
    console.log('Subscribed to price updates');
  }
}