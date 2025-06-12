export interface CleanView {
  id: string;
  code: string;
  name: string;
  icon?: string | null;
  url?: string | null;
  order: number;
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
  children: CleanView[];
}
