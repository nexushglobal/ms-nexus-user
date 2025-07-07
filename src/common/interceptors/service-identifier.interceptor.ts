import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { RpcException } from '@nestjs/microservices';
import { RpcError } from '../interfaces/rpc-error.interface';

@Injectable()
export class ServiceIdentifierInterceptor implements NestInterceptor {
  constructor(private readonly serviceName: string) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((error) => {
        if (error instanceof RpcException) {
          const originalError = error.getError() as RpcError;
          
          // Solo agregar service y timestamp si no existen
          if (typeof originalError === 'object' && originalError) {
            const enhancedError = {
              ...originalError,
              service: originalError.service || this.serviceName,
              timestamp: originalError.timestamp || new Date().toISOString(),
            };

            throw new RpcException(enhancedError);
          }
        }
        
        // Para errores que no son RpcException, los convertimos
        if (error instanceof Error) {
          throw new RpcException({
            status: 500,
            message: [error.message],
            service: this.serviceName,
            timestamp: new Date().toISOString(),
          });
        }
        
        throw error;
      }),
    );
  }
}