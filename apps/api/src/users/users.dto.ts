import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';
import { PERMISSION_CATALOG, type PermissionKey } from '../auth/permissions';

const PERMISSION_KEYS = PERMISSION_CATALOG.map((p) => p.key);

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  firstName!: string;

  @IsString()
  @MinLength(1)
  lastName!: string;

  @IsEnum(Role)
  role!: Role;

  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @IsOptional()
  @IsString()
  npi?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  lastName?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsString()
  licenseNumber?: string | null;

  @IsOptional()
  @IsString()
  npi?: string | null;
}

export class SetUserActiveDto {
  @IsBoolean()
  isActive!: boolean;
}

export class SetPermissionsDto {
  @IsArray()
  @IsIn(PERMISSION_KEYS, { each: true })
  grant!: PermissionKey[];

  @IsArray()
  @IsIn(PERMISSION_KEYS, { each: true })
  deny!: PermissionKey[];
}
