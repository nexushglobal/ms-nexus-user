import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ViewDocument = View & Document;

@Schema({
  timestamps: true,
  versionKey: false,
  collection: 'views',
})
export class View {
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
    trim: true,
    maxlength: 50,
  })
  icon?: string;

  @Prop({
    trim: true,
    maxlength: 255,
  })
  url?: string;

  @Prop({
    default: true,
  })
  isActive: boolean;

  @Prop({
    required: true,
    min: 0,
  })
  order: number;

  @Prop({
    type: Object,
    default: {},
  })
  metadata?: {
    style?: {
      color?: string;
      backgroundColor?: string;
      fontSize?: string;
      fontWeight?: string;
      [key: string]: any;
    };
    [key: string]: any;
  };

  @Prop({
    type: Types.ObjectId,
    ref: 'View',
    default: null,
  })
  parent?: Types.ObjectId;

  @Prop({
    type: [{ type: Types.ObjectId, ref: 'View' }],
    default: [],
  })
  children?: Types.ObjectId[];

  @Prop({
    type: [{ type: Types.ObjectId, ref: 'Role' }],
    default: [],
  })
  roles: Types.ObjectId[];

  // Campos de auditoría
  createdAt?: Date;
  updatedAt?: Date;
}

export const ViewSchema = SchemaFactory.createForClass(View);

// Índices
ViewSchema.index({ code: 1 });
ViewSchema.index({ parent: 1 });
ViewSchema.index({ isActive: 1 });
ViewSchema.index({ order: 1 });
ViewSchema.index({ roles: 1 });
ViewSchema.index({ parent: 1, order: 1 });

// Virtual para verificar si es vista padre
ViewSchema.virtual('isParent').get(function () {
  return this.children && this.children.length > 0;
});

// Virtual para verificar si es vista hija
ViewSchema.virtual('isChild').get(function () {
  return !!this.parent;
});

// Middleware pre-save para validaciones
ViewSchema.pre('save', function (next) {
  // Convertir code a mayúsculas
  if (this.code) {
    this.code = this.code.toUpperCase();
  }
  next();
});
