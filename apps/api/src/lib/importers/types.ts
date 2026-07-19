import type { AuthenticatedUser, Permission } from "@pulse/contracts/auth";
import type {
  BulkImportCommitResult,
  BulkImportCommitSelection,
  BulkImportPreview
} from "@pulse/contracts/bulk-import";

export type UploadedCsv = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export type BulkImporter = {
  key: string;
  readPermission: Permission;
  writePermission: Permission;
  templateFileName: string;
  exportFileName: (date: string) => string;
  template: () => string;
  export: () => Promise<string>;
  preview: (file: UploadedCsv) => Promise<BulkImportPreview>;
  commit: (
    file: UploadedCsv,
    fileDigest: string,
    selections: BulkImportCommitSelection[],
    user: AuthenticatedUser
  ) => Promise<BulkImportCommitResult>;
};
