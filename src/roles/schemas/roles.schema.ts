import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RoleDocument = Role & Document;

@Schema({
  timestamps: true,
  versionKey: false,
  collection: 'roles',
})
export class Role {
  @Prop({
    required: true,
    unique: true,
    trim: true,
    uppercase: true,
    maxlength: 50,
  })
  code: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 100,
  })
  name: string;

  @Prop({
    default: true,
  })
  isActive: boolean;

  @Prop({
    type: [{ type: Types.ObjectId, ref: 'View' }],
    default: [],
  })
  views?: Types.ObjectId[];

  // Campos de auditoría
  createdAt?: Date;
  updatedAt?: Date;
}

export const RoleSchema = SchemaFactory.createForClass(Role);

// Índices
RoleSchema.index({ code: 1 });
RoleSchema.index({ isActive: 1 });
RoleSchema.index({ views: 1 });

// Virtual para contar vistas asignadas
RoleSchema.virtual('viewsCount').get(function () {
  return this.views ? this.views.length : 0;
});

// Middleware pre-save para validaciones
RoleSchema.pre('save', function (next) {
  // Convertir code a mayúsculas
  if (this.code) {
    this.code = this.code.toUpperCase();
  }
  next();
});
