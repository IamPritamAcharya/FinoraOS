import { Module } from '@nestjs/common';
import { DOCUMENT_STORAGE_GATEWAY } from './document-storage.gateway.js';
import { LocalDocumentStorageGateway } from './local-document-storage.gateway.js';

@Module({
  providers: [
    LocalDocumentStorageGateway,
    { provide: DOCUMENT_STORAGE_GATEWAY, useExisting: LocalDocumentStorageGateway },
  ],
  exports: [DOCUMENT_STORAGE_GATEWAY],
})
export class DocumentStorageGatewayModule {}
