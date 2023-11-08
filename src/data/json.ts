import { fileOpen, fileSave } from "./filesystem";
import { cleanAppStateForExport, clearAppStateForDatabase } from "../appState";
import {
  EXPORT_DATA_TYPES,
  EXPORT_SOURCE,
  MIME_TYPES,
  VERSIONS,
} from "../constants";
import { clearElementsForDatabase, clearElementsForExport } from "../element";
import { ExcalidrawElement } from "../element/types";
import { AppState, BinaryFiles, LibraryItems } from "../types";
import { isImageFileHandle, loadFromBlob, normalizeFile } from "./blob";

import {
  ExportedDataState,
  ImportedDataState,
  ExportedLibraryData,
  ImportedLibraryData,
} from "./types";
import { isInTauri } from "../utils";
import { open } from "@tauri-apps/api/dialog";
import { readBinaryFile } from "@tauri-apps/api/fs";

/**
 * Strips out files which are only referenced by deleted elements
 */
const filterOutDeletedFiles = (
  elements: readonly ExcalidrawElement[],
  files: BinaryFiles,
) => {
  const nextFiles: BinaryFiles = {};
  for (const element of elements) {
    if (
      !element.isDeleted &&
      "fileId" in element &&
      element.fileId &&
      files[element.fileId]
    ) {
      nextFiles[element.fileId] = files[element.fileId];
    }
  }
  return nextFiles;
};

export const serializeAsJSON = (
  elements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles,
  type: "local" | "database",
): string => {
  const data: ExportedDataState = {
    type: EXPORT_DATA_TYPES.excalidraw,
    version: VERSIONS.excalidraw,
    source: EXPORT_SOURCE,
    elements:
      type === "local"
        ? clearElementsForExport(elements)
        : clearElementsForDatabase(elements),
    appState:
      type === "local"
        ? cleanAppStateForExport(appState)
        : clearAppStateForDatabase(appState),
    files:
      type === "local"
        ? filterOutDeletedFiles(elements, files)
        : // will be stripped from JSON
          undefined,
  };

  return JSON.stringify(data, null, 2);
};

export const serializeAsBlob = (
  elements: readonly ExcalidrawElement[],
  appState: Partial<AppState>,
  files: BinaryFiles,
  type: "local" | "database",
) => {
  return new Blob([serializeAsJSON(elements, appState, files, type)], {
    type: MIME_TYPES.excalidraw,
  });
};

export const saveAsJSON = async (
  elements: readonly ExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
) => {
  // const serialized = serializeAsJSON(elements, appState, files, "local");
  const blob = serializeAsBlob(elements, appState, files, "local");

  const fileHandle = await fileSave(blob, {
    name: appState.name,
    extension: "excalidraw",
    description: "Excalidraw file",
    fileHandle: isImageFileHandle(appState.fileHandle)
      ? null
      : appState.fileHandle,
  });

  return { fileHandle };
};

export const loadFromJSON = async (
  localAppState: AppState,
  localElements: readonly ExcalidrawElement[] | null,
) => {
  if (isInTauri) {
    const filepath = (await open({
      directory: false,
      multiple: false,
      filters: [
        {
          name: "Excalidraw files",
          extensions: ["excalidraw"],
        },
      ],
    })) as string;

    if (!filepath) {
      return;
    }

    const contents = await readBinaryFile(filepath);
    const blob = new Blob([contents]);

    return loadFromBlob(blob, localAppState, localElements, {
      kind: "file",
      name: filepath,
    } as any);
  }
  const file = await fileOpen({
    description: "Excalidraw files",
    // ToDo: Be over-permissive until https://bugs.webkit.org/show_bug.cgi?id=34442
    // gets resolved. Else, iOS users cannot open `.excalidraw` files.
    // extensions: ["json", "excalidraw", "png", "svg"],
  });

  return loadFromBlob(
    await normalizeFile(file),
    localAppState,
    localElements,
    file.handle,
  );
};

export const isValidExcalidrawData = (data?: {
  type?: any;
  elements?: any;
  appState?: any;
}): data is ImportedDataState => {
  return (
    data?.type === EXPORT_DATA_TYPES.excalidraw &&
    (!data.elements ||
      (Array.isArray(data.elements) &&
        (!data.appState || typeof data.appState === "object")))
  );
};

export const isValidLibrary = (json: any): json is ImportedLibraryData => {
  return (
    typeof json === "object" &&
    json &&
    json.type === EXPORT_DATA_TYPES.excalidrawLibrary &&
    (json.version === 1 || json.version === 2)
  );
};

export const serializeLibraryAsJSON = (libraryItems: LibraryItems) => {
  const data: ExportedLibraryData = {
    type: EXPORT_DATA_TYPES.excalidrawLibrary,
    version: VERSIONS.excalidrawLibrary,
    source: EXPORT_SOURCE,
    libraryItems,
  };
  return JSON.stringify(data, null, 2);
};

export const saveLibraryAsJSON = async (libraryItems: LibraryItems) => {
  const serialized = serializeLibraryAsJSON(libraryItems);
  await fileSave(
    new Blob([serialized], {
      type: MIME_TYPES.excalidrawlib,
    }),
    {
      name: "library",
      extension: "excalidrawlib",
      description: "Excalidraw library file",
    },
  );
};
