interface DurableObjectId {
  toString(): string;
}

interface DurableObjectNamespace {
  idFromString(id: string): DurableObjectId;
  newUniqueId(): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

interface DurableObjectStub {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}

interface DurableObjectSqlResult {
  results?: Array<{
    columns?: string[];
    rows?: Array<Record<string, unknown> | unknown[]>;
  }>;
}

interface DurableObjectSqlStorage {
  exec(query: string, params?: unknown[]): DurableObjectSqlResult | Promise<DurableObjectSqlResult>;
}

interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>;
  put<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  sql: DurableObjectSqlStorage;
}

interface DurableObjectState {
  id: DurableObjectId;
  storage: DurableObjectStorage;
  blockConcurrencyWhile<T>(callback: () => Promise<T>): Promise<T>;
  waitUntil(promise: Promise<unknown>): void;
  acceptWebSocket(
    webSocket: WebSocket,
    options?: {
      allowConcurrency?: boolean;
      requireOrdered?: boolean;
    }
  ): void;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface WebSocketPair {
  0: WebSocket;
  1: WebSocket;
}

declare var WebSocketPair: {
  new (): WebSocketPair;
};
