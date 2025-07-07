import { ValidationError } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';

export const createValidationExceptionFactory = (serviceName: string) => {
  return (errors: ValidationError[]) => {
    const formattedErrors = errors.flatMap((error) => {
      const constraints = Object.values(error.constraints || {});
      return constraints.map((constraint) => constraint);
    });

    return new RpcException({
      status: 400,
      message: formattedErrors,
      service: serviceName,
      timestamp: new Date().toISOString(),
    });
  };
};
