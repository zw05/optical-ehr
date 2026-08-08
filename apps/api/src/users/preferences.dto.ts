import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class AppearanceDto {
  @IsOptional()
  @IsIn(['light', 'slate', 'dark', 'forest', 'high-contrast', 'system'])
  theme?: 'light' | 'slate' | 'dark' | 'forest' | 'high-contrast' | 'system';

  @IsOptional()
  @IsIn(['sm', 'md', 'lg', 'xl'])
  fontScale?: 'sm' | 'md' | 'lg' | 'xl';

  @IsOptional()
  @IsIn(['compact', 'comfortable'])
  density?: 'compact' | 'comfortable';

  @IsOptional()
  @IsIn(['system', 'serif', 'dyslexic'])
  fontFamily?: 'system' | 'serif' | 'dyslexic';
}

class SidebarDto {
  @IsOptional()
  @IsIn(['expanded', 'rail', 'auto'])
  mode?: 'expanded' | 'rail' | 'auto';

  @IsOptional()
  @IsInt()
  @Min(180)
  @Max(400)
  width?: number;
}

class ExamDto {
  @IsOptional()
  @IsString()
  defaultTab?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tabOrder?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hiddenTabs?: string[];

  @IsOptional()
  @IsBoolean()
  singlePageMode?: boolean;

  @IsOptional()
  @IsIn([1, 2, 3])
  fieldColumns?: 1 | 2 | 3;

  @IsOptional()
  @IsBoolean()
  stickyBanner?: boolean;

  @IsOptional()
  @IsNumber()
  autoSaveSeconds?: number | null;
}

class DashboardDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  panelOrder?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hiddenPanels?: string[];

  @IsOptional()
  @IsString()
  landingRoute?: string;
}

class PrintingDto {
  @IsOptional()
  @IsBoolean()
  openInNewTab?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  copies?: number;
}

class AccessibilityDto {
  @IsOptional()
  @IsBoolean()
  reducedMotion?: boolean;

  @IsOptional()
  @IsBoolean()
  boldFocusRing?: boolean;

  @IsOptional()
  @IsBoolean()
  underlineLinks?: boolean;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(30)
  idleTimeoutMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(300)
  idleWarningSeconds?: number;

  @IsOptional()
  @IsBoolean()
  announceSaves?: boolean;

  @IsOptional()
  @IsBoolean()
  keyboardShortcuts?: boolean;
}

/** Nested optional sections for PATCH /users/me/preferences. Unknown keys ignored by merge. */
export class UpdatePreferencesDto {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AppearanceDto)
  appearance?: AppearanceDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => SidebarDto)
  sidebar?: SidebarDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ExamDto)
  exam?: ExamDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => DashboardDto)
  dashboard?: DashboardDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => PrintingDto)
  printing?: PrintingDto;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AccessibilityDto)
  accessibility?: AccessibilityDto;
}
