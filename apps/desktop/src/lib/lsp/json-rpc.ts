import type * as Monaco from "monaco-editor";

/**
 * A minimal JSON-RPC 2.0 endpoint for talking to a language server through
 * the preload bridge. The server is a separate process; messages arrive and
 * leave as serialized JSON strings.
 */

type RequestId = number | string;

type Message = {
  jsonrpc: "2.0";
  id?: RequestId | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
};

type Pending = {
  method: string;
  resolve: (result: unknown) => void;
  reject: (error: unknown) => void;
  cancelListener?: Monaco.IDisposable;
};

export const ErrorCodes = {
  MethodNotFound: -32601,
  InternalError: -32603,
  /** The client cancelled the request. */
  RequestCancelled: -32800,
  /** The document changed under the request; its result would be stale. */
  ContentModified: -32801,
  /** The server cancelled the request. */
  ServerCancelled: -32802,
} as const;

/** An error response from the server. */
export class ResponseError extends Error {
  constructor(
    readonly code: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = "ResponseError";
  }
}

/**
 * The error Monaco treats as a cancellation (`name` and `message` both
 * "Canceled"): it drops the result without logging anything.
 */
export const canceled = () => {
  const error = new Error("Canceled");
  error.name = "Canceled";
  return error;
};

const isCancellation = (code: number) =>
  code === ErrorCodes.RequestCancelled ||
  code === ErrorCodes.ContentModified ||
  code === ErrorCodes.ServerCancelled;

type RequestHandler = (params: unknown) => unknown;
type NotificationHandler = (params: unknown) => void;

export class JsonRpcConnection {
  private nextId = 1;
  private readonly pending = new Map<RequestId, Pending>();
  private readonly requestHandlers = new Map<string, RequestHandler>();
  private readonly notificationHandlers = new Map<string, NotificationHandler>();
  private disposed = false;

  constructor(private readonly write: (message: string) => void) {}

  /**
   * Sends a request. Cancelling `token` tells the server and rejects with
   * `canceled()`, as does the server reporting the result stale.
   */
  request<R>(
    method: string,
    params: unknown,
    token?: Monaco.CancellationToken,
  ): Promise<R> {
    if (this.disposed) return Promise.reject(canceled());
    if (token?.isCancellationRequested) return Promise.reject(canceled());

    const id = this.nextId++;
    return new Promise<R>((resolve, reject) => {
      const pending: Pending = {
        method,
        resolve: resolve as (result: unknown) => void,
        reject,
      };
      if (token) {
        pending.cancelListener = token.onCancellationRequested(() => {
          if (!this.pending.delete(id)) return;
          pending.cancelListener?.dispose();
          this.notify("$/cancelRequest", { id });
          reject(canceled());
        });
      }
      this.pending.set(id, pending);
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method: string, params?: unknown) {
    if (this.disposed) return;
    this.send({ jsonrpc: "2.0", method, params });
  }

  /** Answers the server's requests for `method`. A thrown error becomes an error response. */
  onRequest(method: string, handler: RequestHandler) {
    this.requestHandlers.set(method, handler);
  }

  onNotification(method: string, handler: NotificationHandler) {
    this.notificationHandlers.set(method, handler);
  }

  /** Feeds in one message from the server. */
  receive(raw: string) {
    if (this.disposed) return;
    let message: Message;
    try {
      message = JSON.parse(raw) as Message;
    } catch {
      console.error("Language server sent invalid JSON", raw.slice(0, 200));
      return;
    }

    if (message.method === undefined) {
      this.handleResponse(message);
    } else if (message.id === undefined || message.id === null) {
      this.handleNotification(message.method, message.params);
    } else {
      void this.handleRequest(message.id, message.method, message.params);
    }
  }

  /** Rejects everything still waiting (as cancelled) and ignores further traffic. */
  dispose() {
    this.disposed = true;
    for (const pending of this.pending.values()) {
      pending.cancelListener?.dispose();
      pending.reject(canceled());
    }
    this.pending.clear();
  }

  private send(message: Message) {
    this.write(JSON.stringify(message));
  }

  private handleResponse(message: Message) {
    if (message.id === undefined || message.id === null) return;
    const pending = this.pending.get(message.id);
    if (!pending) return; // Cancelled meanwhile.
    this.pending.delete(message.id);
    pending.cancelListener?.dispose();

    if (message.error) {
      const { code, message: text, data } = message.error;
      pending.reject(
        isCancellation(code) ? canceled() : new ResponseError(code, text, data),
      );
    } else {
      pending.resolve(message.result ?? null);
    }
  }

  private handleNotification(method: string, params: unknown) {
    const handler = this.notificationHandlers.get(method);
    if (!handler) return; // Unknown notifications may be ignored, `$/` ones must be.
    try {
      handler(params);
    } catch (error) {
      console.error(`Language server notification ${method} failed`, error);
    }
  }

  private async handleRequest(id: RequestId, method: string, params: unknown) {
    const handler = this.requestHandlers.get(method);
    if (!handler) {
      this.send({
        jsonrpc: "2.0",
        id,
        error: {
          code: ErrorCodes.MethodNotFound,
          message: `Unhandled method ${method}`,
        },
      });
      return;
    }
    try {
      const result = await handler(params);
      this.send({ jsonrpc: "2.0", id, result: result ?? null });
    } catch (error) {
      console.error(`Language server request ${method} failed`, error);
      this.send({
        jsonrpc: "2.0",
        id,
        error: {
          code: ErrorCodes.InternalError,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
