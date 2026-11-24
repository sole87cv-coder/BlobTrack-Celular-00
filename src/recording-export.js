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
  const ext = result.extension || 'webm';
  let file = null;
  if (typeof FileClass === 'function') {
    try {
      file = new FileClass([result.blob], filename, { type: result.mimeType });
    } catch (error) {
      onError('preparação do arquivo', error);
    }
  }

  // 1) Salvar em local escolhido pelo usuário (inclui cartão SD no Android via seletor do sistema)
  if (typeof windowObject?.showSaveFilePicker === 'function' && file) {
    try {
      const handle = await windowObject.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: 'Vídeo BlobTrack',
          accept: {
            'video/mp4': ['.mp4'],
            'video/webm': ['.webm'],
            'video/*': [`.${ext}`],
          },
        }],
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

  // 2) Compartilhar arquivo (Android share sheet)
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

  // 3) Download direto
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
