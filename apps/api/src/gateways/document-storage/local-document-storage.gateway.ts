import { Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { DocumentStorageGateway, StoreDocumentInput } from './document-storage.gateway.js';

const safeSegment = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);

@Injectable()
export class LocalDocumentStorageGateway implements DocumentStorageGateway {
  async store(input: StoreDocumentInput) {
    const root = path.resolve(process.env.DOCUMENT_STORAGE_PATH ?? '.data/documents');
    const organizationDirectory = path.join(root, safeSegment(input.organizationId));
    await mkdir(organizationDirectory, { recursive: true });
    const storedName = `${input.sha256}-${safeSegment(input.fileName)}`;
    const absolutePath = path.join(organizationDirectory, storedName);
    await writeFile(absolutePath, input.bytes, { flag: 'wx' }).catch(
      (error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error;
      },
    );
    return {
      storageKey: path.relative(root, absolutePath),
      sizeBytes: input.bytes.byteLength,
    };
  }
}
