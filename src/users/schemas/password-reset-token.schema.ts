import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PasswordResetTokenDocument = PasswordResetToken & Document;

@Schema({
  timestamps: true,
  versionKey: false,
  collection: 'password_reset_tokens',
})
export class PasswordResetToken {
  @Prop({
    required: true,
    unique: true,
    trim: true,
  })
  token: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
  })
  user: Types.ObjectId;

  @Prop({
    required: true,
    type: Date,
  })
  expiresAt: Date;

  @Prop({
    default: false,
  })
  isUsed: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PasswordResetTokenSchema =
  SchemaFactory.createForClass(PasswordResetToken);

// Índices - Eliminamos duplicados
PasswordResetTokenSchema.index({ user: 1 });
PasswordResetTokenSchema.index({ isUsed: 1 });
PasswordResetTokenSchema.index({ token: 1, isUsed: 1 });

// Índice TTL para eliminar automáticamente tokens expirados después de 48 horas
// Este reemplaza el índice simple de expiresAt
PasswordResetTokenSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 172800 }, // 48 horas
);
