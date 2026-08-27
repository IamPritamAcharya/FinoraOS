export type StoreDocumentInput = {
  organizationId: string;
  fileName: string;
  mimeType: string;
  sha256: string;
  bytes: Uint8Array;
};

export type StoredDocument = {
  storageKey: string;
  sizeBytes: number;
};

export interface DocumentStorageGateway {
  store(input: StoreDocumentInput): Promise<StoredDocument>;
}

export const DOCUMENT_STORAGE_GATEWAY = Symbol('DOCUMENT_STORAGE_GATEWAY');
