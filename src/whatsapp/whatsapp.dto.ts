import { IsNotEmpty, IsString, IsOptional, IsUrl } from 'class-validator';

export class SendMessageDto {
  @IsNotEmpty()
  @IsString()
  phoneNumber!: string;

  @IsNotEmpty()
  @IsString()
  message!: string;
}

export class SendPDFDto {
  @IsNotEmpty()
  @IsString()
  phoneNumber!: string;

  @IsNotEmpty()
  @IsUrl()
  pdfUrl!: string;

  @IsOptional()
  @IsString()
  caption?: string;
}

export class SendMediaDto {
  @IsNotEmpty()
  @IsString()
  phoneNumber!: string;

  @IsNotEmpty()
  @IsUrl()
  mediaUrl!: string;

  @IsOptional()
  @IsString()
  caption?: string;
}

export class SendBulkMessageDto {
  @IsNotEmpty()
  phoneNumbers!: string[];

  @IsNotEmpty()
  @IsString()
  message!: string;
}
