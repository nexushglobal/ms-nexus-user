export interface RpcError {
  status: number;
  message: string[];
  service?: string;
  timestamp?: string;

  // Para errores con estructura anidada (como rpcError.error)
  error?: {
    status?: number;
    message?: string | string[];
    errors?: string | string[];
  };

  // Para errores con response anidado (como rpcError.response)
  response?: {
    status?: number;
    message?: string | string[];
  };

  // Para errores de base de datos
  errno?: number;
  code?: string;
  sqlMessage?: string;

  // Campo adicional para errores estructurados
  errors?: string | string[];
}
