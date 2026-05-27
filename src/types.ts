export type ColumnType = 'text' | 'number' | 'select' | 'boolean' | 'date';

export interface Column {
  id: string;
  name: string;
  type: ColumnType;
  options?: string[]; // Used if type is 'select'
}

export interface Row {
  id: string;
  [key: string]: any;
}

export interface TableSchema {
  id: string;
  name: string;
  columns: Column[];
  rows: Row[];
}

export interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'SCHEMA_CHANGE';
  tableId: string;
  tableName: string;
  details: string;
}

export interface DbState {
  tables: TableSchema[];
  logs: AuditLog[];
}
