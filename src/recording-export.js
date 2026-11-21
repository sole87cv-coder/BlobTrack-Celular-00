function isAbortError(error) {
  return error?.name === 'AbortError';
}

export async function exportRecording(result, {
  filename,
  navigatorObject = globalThis.navigator,
  windowObject = globalThis.window,
  documentObject = globalThis.document,
  URLClass = globalThis.URL,
  FileClass = globalThis.File,
  setTimeoutFn = globalThis.setTimeout,
  onError = () => {},
} = {}) {
  const mimeType = result.mimeType.split(';', 1)[0];
  let file = null;
  if (typeof FileClass === 'function') {
    try {
      file = new FileClass([result.blob], filename, { type: result.mimeType });
    } catch (error) {
      onError('preparação do arquivo', error);
    }
  }

  if (file && typeof navigatorObject?.canShare === 'function' && typeof navigatorObject.share === 'function') {
    try {
      if (navigatorObject.canShare({ files: [file] })) {
        await navigatorObject.share({ files: [file], title: 'BlobTrack Celular' });
        return 'shared';
      }
    } catch (error) {
      if (isAbortError(error)) return 'cancelled';
      onError('compartilhamento', error);
    }
  }

  if (typeof windowObject?.showSaveFilePicker === 'function') {
    try {
      const handle = await windowObject.showSaveFilePicker({
        suggestedName: filename,
        types: [{ description: 'Vídeo BlobTrack', accept: { [mimeType]: [`.${result.extension}`] } }],
      });
      const writable = await handle.createWritable();
      try {
        await writable.write(result.blob);
        await writable.close();
      } catch (error) {
        if (typeof writable.abort === 'function') {
          try { await writable.abort(); }
          catch (cleanupError) { onError('limpeza do arquivo incompleto', cleanupError); }
        }
        throw error;
      }
      return 'saved';
    } catch (error) {
      if (isAbortError(error)) return 'cancelled';
      onError('seletor de arquivo', error);
    }
  }

  let url = result.url;
  const createdUrl = !url;
  if (createdUrl) url = URLClass.createObjectURL(result.blob);
  try {
    const link = documentObject.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
  } catch (error) {
    if (createdUrl) URLClass.revokeObjectURL(url);
    throw error;
  }
  if (!result.url) setTimeoutFn(() => URLClass.revokeObjectURL(url), 4000);
  return 'downloaded';
}
