/** Minimal pg client surface used by the local staff-role utility. */
declare module 'pg' {
  export interface QueryResult<Row = Record<string, unknown>> {
    rowCount: number | null;
    rows: Row[];
  }
  export class Client {
    constructor(config: {
      host?: string;
      port?: number;
      user?: string;
      password?: string;
      database?: string;
      ssl?: boolean | { rejectUnauthorized?: boolean };
    });
    connect(): Promise<void>;
    query<Row = Record<string, unknown>>(
      text: string,
      values?: unknown[],
    ): Promise<QueryResult<Row>>;
    end(): Promise<void>;
  }
}
