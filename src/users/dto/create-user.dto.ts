export class RegisterDto {
  // Datos básicos de la cuenta
  email: string;
  password: string;

  // Datos personales
  firstName: string;
  lastName: string;
  phone: string;
  birthDate: string;
  gender: string;

  // Ubicación

  country: string;

  // Sistema de referidos

  referrerCode?: string;
  position?: 'LEFT' | 'RIGHT';
  roleCode: string;
  documentType: string;
  documentNumber: string;
}
