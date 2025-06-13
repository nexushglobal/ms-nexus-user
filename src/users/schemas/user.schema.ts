import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserDocument = User & Document;

// Enums
export enum DocumentType {
  DNI = 'DNI',
  CE = 'CE',
  PAS = 'PAS',
}

export enum Gender {
  MASCULINO = 'Masculino',
  FEMENINO = 'Femenino',
  OTRO = 'Otro',
}

export enum Position {
  LEFT = 'LEFT',
  RIGHT = 'RIGHT',
}

// Subdocumento PersonalInfo
@Schema({ _id: false })
export class PersonalInfo {
  @Prop({
    required: true,
    trim: true,
    maxlength: 100,
  })
  firstName: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 100,
  })
  lastName: string;

  @Prop({
    type: String,
    enum: DocumentType,
    required: true,
  })
  documentType: DocumentType;

  @Prop({
    required: true,
    trim: true,
    maxlength: 20,
  })
  documentNumber: string;

  @Prop({
    type: String,
    enum: Gender,
    required: true,
  })
  gender: Gender;

  @Prop({
    required: true,
    type: Date,
  })
  birthdate: Date;
}

export const PersonalInfoSchema = SchemaFactory.createForClass(PersonalInfo);

// Subdocumento ContactInfo
@Schema({ _id: false })
export class ContactInfo {
  @Prop({
    required: true,
    trim: true,
    maxlength: 20,
  })
  phone: string;

  @Prop({
    trim: true,
    maxlength: 255,
  })
  address?: string;

  @Prop({
    trim: true,
    maxlength: 10,
  })
  postalCode?: string;

  @Prop({
    required: true,
    trim: true,
    maxlength: 100,
  })
  country: string;
}

export const ContactInfoSchema = SchemaFactory.createForClass(ContactInfo);

@Schema({ _id: false })
export class BankInfo {
  @Prop({
    trim: true,
    maxlength: 100,
  })
  bankName?: string;

  @Prop({
    trim: true,
    maxlength: 50,
  })
  accountNumber?: string;

  @Prop({
    trim: true,
    maxlength: 50,
  })
  cci?: string;
}

export const BankInfoSchema = SchemaFactory.createForClass(BankInfo);

@Schema({ _id: false })
export class BillingInfo {
  @Prop({
    trim: true,
    maxlength: 11,
  })
  ruc?: string;

  @Prop({
    trim: true,
    maxlength: 255,
  })
  razonSocial?: string;

  @Prop({
    trim: true,
    maxlength: 255,
  })
  address?: string;
}

export const BillingInfoSchema = SchemaFactory.createForClass(BillingInfo);

@Schema({
  timestamps: true,
  versionKey: false,
  collection: 'users',
})
export class User {
  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Email format is invalid',
    ],
  })
  email: string;

  @Prop({
    required: true,
    minlength: 6,
  })
  password: string;

  @Prop({
    required: true,
    unique: true,
    uppercase: true,
    trim: true,
    maxlength: 20,
  })
  referralCode: string;

  @Prop({
    uppercase: true,
    trim: true,
    maxlength: 20,
  })
  referrerCode?: string;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    default: null,
  })
  parent?: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    default: null,
  })
  leftChild?: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    default: null,
  })
  rightChild?: Types.ObjectId;

  @Prop({
    type: String,
    enum: Position,
  })
  position?: Position;

  @Prop({
    default: true,
  })
  isActive: boolean;

  @Prop({
    type: Date,
    default: null,
  })
  lastLoginAt?: Date;

  @Prop({
    type: Types.ObjectId,
    ref: 'Role',
    required: true,
  })
  role: Types.ObjectId;

  @Prop({
    type: PersonalInfoSchema,
    required: true,
  })
  personalInfo: PersonalInfo;

  @Prop({
    type: ContactInfoSchema,
  })
  contactInfo?: ContactInfo;

  @Prop({
    type: BillingInfoSchema,
  })
  billingInfo?: BillingInfo;

  @Prop({
    type: BankInfoSchema,
  })
  bankInfo?: BankInfo;

  @Prop({
    trim: true,
    maxlength: 50,
  })
  nickname?: string;

  @Prop({
    trim: true,
    maxlength: 500,
  })
  photo?: string;

  @Prop({
    trim: true,
    maxlength: 255,
  })
  photoKey?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Índices - Eliminamos los duplicados y organizamos mejor
UserSchema.index({ referrerCode: 1 });
UserSchema.index({ parent: 1 });
UserSchema.index({ leftChild: 1 });
UserSchema.index({ rightChild: 1 });
UserSchema.index({ position: 1 });
UserSchema.index({ isActive: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ 'contactInfo.phone': 1 });
UserSchema.index({ 'contactInfo.country': 1 });
UserSchema.index({ 'billingInfo.ruc': 1 });

// Índices compuestos
UserSchema.index({ parent: 1, position: 1 });
UserSchema.index({ isActive: 1, role: 1 });
UserSchema.index({ referrerCode: 1, isActive: 1 });

// Índice único compuesto para documento (solo uno, eliminamos el duplicado)
UserSchema.index(
  { 'personalInfo.documentType': 1, 'personalInfo.documentNumber': 1 },
  { unique: true },
);

// Virtuals
UserSchema.virtual('fullName').get(function () {
  return `${this.personalInfo.firstName} ${this.personalInfo.lastName}`;
});

UserSchema.virtual('hasLeftChild').get(function () {
  return !!this.leftChild;
});

UserSchema.virtual('hasRightChild').get(function () {
  return !!this.rightChild;
});

UserSchema.virtual('hasChildren').get(function () {
  return !!this.leftChild || !!this.rightChild;
});

UserSchema.virtual('isRoot').get(function () {
  return !this.parent;
});

// Middleware pre-save
UserSchema.pre('save', function (next) {
  if (this.referralCode) {
    this.referralCode = this.referralCode.toUpperCase();
  }
  if (this.referrerCode) {
    this.referrerCode = this.referrerCode.toUpperCase();
  }

  if (this.email) {
    this.email = this.email.toLowerCase();
  }

  next();
});

// Método toJSON para excluir password
UserSchema.methods.toJSON = function (): Record<string, unknown> {
  const obj: Record<string, unknown> = this.toObject();
  delete obj.password;
  return obj;
};
